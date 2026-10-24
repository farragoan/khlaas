"use client";

export function OfflineRetry() {
  return (
    <button
      type="button"
      onClick={() => window.location.reload()}
      className="min-h-11 rounded-xl bg-brand px-6 font-medium text-on-brand"
    >
      Retry
    </button>
  );
}
