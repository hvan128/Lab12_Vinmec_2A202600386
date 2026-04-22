"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, UserPlus } from "lucide-react";
import { VinmecLogo } from "@/components/brand/VinmecLogo";
import { MobileStatusBar } from "@/components/layout/MobileStatusBar";
import { useUserSession } from "@/lib/store/user-session";

export function RegisterClient() {
  const setUser = useUserSession((s) => s.setUser);
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    age: "",
    gender: "male",
    username: "",
    password: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, age: Number(form.age) }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Đăng ký thất bại");
        return;
      }

      setUser(data.user);
      router.replace("/chat");
    } catch {
      setError("Lỗi kết nối, vui lòng thử lại");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      <MobileStatusBar />

      {/* Header */}
      <div className="bg-vinmec-primary px-6 pt-8 pb-10 flex flex-col items-center gap-3">
        <VinmecLogo size={40} />
        <p className="text-white/90 text-sm font-medium mt-1">
          Trợ lý ảo sức khỏe 24/7
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 bg-vinmec-surface px-4 -mt-4 rounded-t-3xl overflow-y-auto">
        <div className="pt-6 pb-4 px-1">
          <h1 className="text-xl font-bold text-vinmec-text mb-1">
            Đăng ký tài khoản
          </h1>
          <p className="text-sm text-vinmec-text-muted">
            Tạo tài khoản mới để sử dụng VinmecCare
          </p>
        </div>

        <form onSubmit={handleRegister} className="space-y-4 mt-2 pb-6">
          <div>
            <label className="text-sm font-medium text-vinmec-text mb-1.5 block">
              Họ và tên
            </label>
            <input
              name="name"
              value={form.name}
              onChange={handleChange}
              placeholder="Nhập họ và tên đầy đủ"
              required
              autoComplete="name"
              className="w-full px-4 py-3 rounded-xl border border-vinmec-border bg-vinmec-bg text-vinmec-text placeholder:text-vinmec-text-subtle focus:outline-none focus:ring-2 focus:ring-vinmec-primary transition-shadow"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-vinmec-text mb-1.5 block">
                Tuổi
              </label>
              <input
                name="age"
                type="number"
                min="1"
                max="120"
                value={form.age}
                onChange={handleChange}
                placeholder="Tuổi"
                required
                className="w-full px-4 py-3 rounded-xl border border-vinmec-border bg-vinmec-bg text-vinmec-text placeholder:text-vinmec-text-subtle focus:outline-none focus:ring-2 focus:ring-vinmec-primary transition-shadow"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-vinmec-text mb-1.5 block">
                Giới tính
              </label>
              <select
                name="gender"
                value={form.gender}
                onChange={handleChange}
                className="w-full px-4 py-3 rounded-xl border border-vinmec-border bg-vinmec-bg text-vinmec-text focus:outline-none focus:ring-2 focus:ring-vinmec-primary transition-shadow"
              >
                <option value="male">Nam</option>
                <option value="female">Nữ</option>
                <option value="other">Khác</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-vinmec-text mb-1.5 block">
              Tên đăng nhập
            </label>
            <input
              name="username"
              value={form.username}
              onChange={handleChange}
              placeholder="Chỉ dùng chữ thường và số"
              required
              autoComplete="username"
              className="w-full px-4 py-3 rounded-xl border border-vinmec-border bg-vinmec-bg text-vinmec-text placeholder:text-vinmec-text-subtle focus:outline-none focus:ring-2 focus:ring-vinmec-primary transition-shadow"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-vinmec-text mb-1.5 block">
              Mật khẩu
            </label>
            <div className="relative">
              <input
                name="password"
                type={showPassword ? "text" : "password"}
                value={form.password}
                onChange={handleChange}
                placeholder="Ít nhất 6 ký tự"
                required
                minLength={6}
                autoComplete="new-password"
                className="w-full px-4 py-3 pr-12 rounded-xl border border-vinmec-border bg-vinmec-bg text-vinmec-text placeholder:text-vinmec-text-subtle focus:outline-none focus:ring-2 focus:ring-vinmec-primary transition-shadow"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-vinmec-text-subtle hover:text-vinmec-text transition-colors"
                aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 px-3 py-2.5 rounded-xl">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-vinmec-primary text-white font-semibold rounded-xl flex items-center justify-center gap-2 hover:bg-vinmec-primary/90 active:scale-[0.98] transition-all disabled:opacity-60"
          >
            {loading ? (
              <span className="flex gap-1.5">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-1.5 h-1.5 bg-white rounded-full animate-typing-dot"
                    style={{ animationDelay: `${i * 0.16}s` }}
                  />
                ))}
              </span>
            ) : (
              <>
                <UserPlus size={18} />
                Đăng ký
              </>
            )}
          </button>

          <p className="text-center text-sm text-vinmec-text-muted">
            Đã có tài khoản?{" "}
            <Link
              href="/login"
              className="text-vinmec-primary font-semibold hover:underline"
            >
              Đăng nhập
            </Link>
          </p>
        </form>
      </div>

      {/* Footer */}
      <div className="bg-vinmec-surface py-4 text-center">
        <p className="text-xs text-vinmec-text-subtle">
          Powered by OpenAI • Demo học tập
        </p>
      </div>
    </div>
  );
}
