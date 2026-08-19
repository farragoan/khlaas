import { NextResponse } from "next/server";
import { checkAdmin } from "@/lib/admin";
import { runAllChecks, overallStatus } from "@/lib/health/checks";
import { reportError } from "@/lib/observability";

// The checks call live upstreams; a cached answer would be a lie about "now".
export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await checkAdmin();

  if (!admin.allowed) {
    // The caller's own id goes back so they can add themselves to the
    // allowlist without anyone having to guess it from the database. It is
    // their id and nobody else's, so this leaks nothing.
    return NextResponse.json(
      {
        error: admin.configured ? "Not an admin" : "ADMIN_USER_IDS is not set",
        yourUserId: admin.userId,
        configured: admin.configured,
      },
      { status: 403 }
    );
  }

  try {
    const checks = await runAllChecks();
    return NextResponse.json({
      status: overallStatus(checks),
      checks,
      deployedCommitRef: process.env.COMMIT_REF ?? null,
      checkedAt: new Date().toISOString(),
    });
  } catch (err) {
    await reportError(err, { operation: "admin health check" });
    return NextResponse.json({ error: "Health check failed to run" }, { status: 500 });
  }
}
