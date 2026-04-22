"use client";

import { useRef, useState } from "react";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface ReceiptUploadProps {
  tableId: string;
  onProcessed: () => void;
}

export function ReceiptUpload({ tableId, onProcessed }: ReceiptUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    setUploading(true);

    try {
      // Convert to base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1]); // strip data URL prefix
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const res = await fetch("/api/receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableId, imageBase64: base64 }),
      });

      if (!res.ok) {
        let message = "Upload failed";
        try {
          const body = await res.json();
          message = body.error ?? message;
        } catch {
          // server returned non-JSON (e.g. plain-text 500)
        }
        throw new Error(message);
      }

      onProcessed();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to process receipt");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />

      <Button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="w-full h-14 bg-[var(--brand)] hover:bg-amber-300 text-black font-semibold text-base rounded-2xl flex items-center gap-2"
      >
        <Camera size={20} />
        {uploading ? "Processing receipt…" : "Scan receipt"}
      </Button>

      {uploading && (
        <p className="text-sm text-zinc-400 text-center animate-pulse">
          Reading your bill, this takes a few seconds…
        </p>
      )}
    </div>
  );
}
