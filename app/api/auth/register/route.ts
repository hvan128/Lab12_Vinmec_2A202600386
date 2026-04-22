import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import bcrypt from "bcryptjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const { username, password, name, age, gender } = body as {
    username?: string;
    password?: string;
    name?: string;
    age?: number;
    gender?: string;
  };

  if (!username?.trim() || !password || !name?.trim() || !age || !gender) {
    return NextResponse.json({ error: "Vui lòng điền đầy đủ thông tin" }, { status: 400 });
  }

  if (password.length < 6) {
    return NextResponse.json({ error: "Mật khẩu phải có ít nhất 6 ký tự" }, { status: 400 });
  }

  const normalizedUsername = username.trim().toLowerCase();

  const existing = await prisma.user.findUnique({ where: { username: normalizedUsername } });
  if (existing) {
    return NextResponse.json({ error: "Tên đăng nhập đã tồn tại" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      id: `user-${Date.now()}`,
      username: normalizedUsername,
      passwordHash,
      name: name.trim(),
      age: Number(age),
      gender,
    },
    select: {
      id: true,
      name: true,
      age: true,
      gender: true,
      avatarUrl: true,
      medicalNotes: true,
    },
  });

  return NextResponse.json({ user }, { status: 201 });
}
