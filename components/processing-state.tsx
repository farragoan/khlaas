import { Skeleton } from "@/components/ui/skeleton";
import { ScanningLoader } from "@/components/scanning-loader";

export function ProcessingState() {
  return (
    <div className="space-y-3 py-4">
      <div className="mb-6">
        <ScanningLoader messages={["Reading the receipt…", "Finding the items…", "Almost ready…"]} />
      </div>
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
