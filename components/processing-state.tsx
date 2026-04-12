import { Skeleton } from "@/components/ui/skeleton";

export function ProcessingState() {
  return (
    <div className="space-y-3 py-4">
      <p className="text-sm text-zinc-400 text-center animate-pulse mb-6">
        Reading your receipt…
      </p>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 h-14 bg-[var(--surface)] rounded-xl">
          <Skeleton className="w-5 h-5 rounded-md bg-zinc-800" />
          <Skeleton className="h-4 flex-1 rounded bg-zinc-800" />
          <Skeleton className="h-4 w-16 rounded bg-zinc-800" />
        </div>
      ))}
    </div>
  );
}
