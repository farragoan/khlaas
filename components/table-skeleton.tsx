import { Skeleton } from "@/components/ui/skeleton";

export function TableSkeleton() {
  return (
    <div className="min-h-dvh bg-[#0F0F0F] flex flex-col max-w-lg mx-auto px-4">
      <div className="flex items-center justify-between py-5">
        <Skeleton className="w-24 h-6 rounded-md" />
        <Skeleton className="w-14 h-5 rounded-md" />
      </div>
      <Skeleton className="w-40 h-6 rounded-full mb-5" />
      <Skeleton className="w-full h-10 rounded-xl mb-3" />
      <Skeleton className="w-full h-10 rounded-xl mb-3" />
      <Skeleton className="w-full h-10 rounded-xl mb-3" />
      <Skeleton className="w-full h-10 rounded-xl mb-3" />
      <Skeleton className="w-full h-10 rounded-xl mb-3" />
      <Skeleton className="w-full h-10 rounded-xl" />
    </div>
  );
}
