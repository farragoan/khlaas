import { OfflineRetry } from "./retry-button";

export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold text-white">You&apos;re offline</h1>
      <p className="max-w-xs text-zinc-400">
        खल्लास needs a connection to load your bill. Check your network and try
        again.
      </p>
      <OfflineRetry />
    </main>
  );
}
