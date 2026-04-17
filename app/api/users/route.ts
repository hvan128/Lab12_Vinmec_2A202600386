import { prisma } from "@/lib/db/client";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      age: true,
      gender: true,
      avatarUrl: true,
      medicalNotes: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ users });
}
