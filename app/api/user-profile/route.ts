import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db/client";
import { userProfiles } from "@/lib/db/schema";
import { UpdateUserProfileSchema } from "@/lib/schemas";
import { eq } from "drizzle-orm";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.clerkUserId, userId))
    .limit(1);

  return NextResponse.json(profile[0] ?? null);
}

export async function PUT(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = UpdateUserProfileSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { displayName, upiId } = parsed.data;

  const existing = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.clerkUserId, userId))
    .limit(1);

  if (existing[0]) {
    await db
      .update(userProfiles)
      .set({
        displayName: displayName ?? existing[0].displayName,
        upiId: upiId ?? existing[0].upiId,
        updatedAt: new Date(),
      })
      .where(eq(userProfiles.clerkUserId, userId));
  } else {
    await db.insert(userProfiles).values({
      clerkUserId: userId,
      displayName: displayName ?? null,
      upiId: upiId ?? null,
    });
  }

  return NextResponse.json({ success: true });
}
