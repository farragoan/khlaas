import { Skeleton } from "@/components/ui/skeleton";

export function SettleSkeleton() {
  return (
    <div className="min-h-dvh bg-[#0F0F0F] flex flex-col max-w-lg mx-auto px-4">
      <div className="flex items-center justify-between py-5">
        <Skeleton className="w-6 h-6 rounded-md" />
        <Skeleton className="w-20 h-5 rounded-md" />
        <Skeleton className="w-12 h-5 rounded-md" />
      </div>
      <Skeleton className="w-48 h-7 rounded-lg mb-2" />
      <Skeleton className="w-36 h-4 rounded-md mb-6" />
      <Skeleton className="w-28 h-3 rounded-md mb-2" />
      <div className="flex gap-2 mb-6">
        <Skeleton className="w-32 h-9 rounded-xl" />
        <Skeleton className="w-28 h-9 rounded-xl" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="w-full h-16 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
