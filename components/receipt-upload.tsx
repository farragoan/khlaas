"use client";

import { useRef, useState } from "react";
import { Camera, Image } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScanningLoader } from "@/components/scanning-loader";
import { toast } from "sonner";

interface ReceiptUploadProps {
  tableId: string;
  sessionToken: string;
  onProcessed: () => void;
  onUploadStarted?: () => void;
}

const IMAGE_CACHE_PREFIX = "khlaas:receipt:";

async function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 1200;
        const MAX_HEIGHT = 1200;
        let { width, height } = img;

        if (width > MAX_WIDTH || height > MAX_HEIGHT) {
          const ratio = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Failed to get canvas context"));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
        resolve(dataUrl.split(",")[1]);
      };
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function cacheImage(tableId: string, base64: string) {
  try {
    localStorage.setItem(`${IMAGE_CACHE_PREFIX}${tableId}`, base64);
  } catch {}
}

function getCachedImage(tableId: string): string | null {
  try {
    return localStorage.getItem(`${IMAGE_CACHE_PREFIX}${tableId}`);
  } catch {
    return null;
  }
}

function clearCachedImage(tableId: string) {
  try {
    localStorage.removeItem(`${IMAGE_CACHE_PREFIX}${tableId}`);
  } catch {}
}

async function uploadReceipt(
  tableId: string,
  sessionToken: string,
  base64: string
): Promise<boolean> {
  const res = await fetch("/api/receipts", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-session-token": sessionToken },
    body: JSON.stringify({ tableId, imageBase64: base64 }),
  });

  if (res.ok) return true;

  // Server error (500) — retry with cached image if available
  if (res.status >= 500) {
    const cached = getCachedImage(tableId);
    if (cached && cached !== base64) {
      const retryRes = await fetch("/api/receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-session-token": sessionToken },
        body: JSON.stringify({ tableId, imageBase64: cached }),
      });
      if (retryRes.ok) return true;
    }
  }

  let message = "Upload failed";
  try {
    const body = await res.json();
    message = body.error ?? message;
  } catch {}
  throw new Error(message);
}

export function ReceiptUpload({ tableId, sessionToken, onProcessed, onUploadStarted }: ReceiptUploadProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const processingRef = useRef(false);

  async function handleFile(file: File) {
    if (processingRef.current) return;
    processingRef.current = true;
    setUploading(true);
    onUploadStarted?.();

    try {
      const base64 = await compressImage(file);

      // Cache the image for retry
      cacheImage(tableId, base64);

      await uploadReceipt(tableId, sessionToken, base64);

      clearCachedImage(tableId);
      onProcessed();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to process receipt");
      setUploading(false);
    } finally {
      processingRef.current = false;
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) handleFile(file);
  }

  return (
    <div className="space-y-3">
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleInputChange}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleInputChange}
      />
      <div className="flex gap-3">
        <Button
          onClick={() => cameraInputRef.current?.click()}
          disabled={uploading}
          className="flex-1 h-14 bg-[var(--brand)] hover:bg-amber-300 text-black font-semibold text-base rounded-2xl flex items-center justify-center gap-2"
        >
          <Camera size={20} />
          {uploading ? "Processing…" : "Take photo"}
        </Button>
        <Button
          onClick={() => galleryInputRef.current?.click()}
          disabled={uploading}
          className="flex-1 h-14 bg-[var(--surface-raised)] hover:bg-zinc-700 text-white font-semibold text-base rounded-2xl flex items-center justify-center gap-2 border border-zinc-700"
        >
          <Image size={20} />
          {uploading ? "Processing…" : "Choose photo"}
        </Button>
      </div>
      {uploading && (
        <ScanningLoader messages={["Reading your receipt…", "Finding the items…", "Matching up the prices…", "Almost there…"]} />
      )}
    </div>
  );
}
