"use client";

export function OfflineRetry() {
  return (
    <button
      type="button"
      onClick={() => window.location.reload()}
      className="min-h-11 rounded-xl bg-amber-400 px-6 font-medium text-black"
    >
      Retry
    </button>
  );
}
