import { PhoneFrame } from "@/components/layout/PhoneFrame";
import { prisma } from "@/lib/db/client";
import { LoginClient } from "./LoginClient";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
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

  return (
    <PhoneFrame>
      <LoginClient users={users} />
    </PhoneFrame>
  );
}
