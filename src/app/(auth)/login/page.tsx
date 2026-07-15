"use client";

import { Suspense, useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { login } from "../actions";

function LoginForm() {
  const searchParams = useSearchParams();
  const message = searchParams.get("message");
  const [state, formAction, pending] = useActionState(login, null);

  return (
    <div className="rounded-2xl p-8 border border-sw-border-default" style={{ background: "var(--sw-bg-surface)" }}>
      {/* Logo */}
      <div className="mb-8 text-center">
        <span className="text-2xl font-black tracking-tight text-sw-text-primary">
          ✦ Smart Writer
        </span>
        <p className="mt-2 text-sm text-sw-text-muted">
          쓰는 만큼 똑똑해지는 세계관
        </p>
      </div>

      <h1 className="mb-6 text-xl font-black text-sw-text-primary">로그인</h1>

      <form action={formAction} className="space-y-4">
        {message && (
          <div className="rounded-lg border border-sw-border-default bg-sw-accent-bg px-3 py-2 text-sm text-sw-text-secondary">
            {message}
          </div>
        )}
        {state?.error && (
          <div className="rounded-lg border border-sw-danger/20 bg-sw-danger/10 px-3 py-2 text-sm text-sw-danger">
            {state.error}
          </div>
        )}

        <div className="space-y-1.5">
          <label
            htmlFor="email"
            className="block text-[11px] font-bold uppercase tracking-[0.06em] text-sw-text-muted"
          >
            이메일
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            required
            className="h-10 w-full rounded-xl border border-sw-border-default bg-sw-bg-elevated px-3 text-sm text-sw-text-primary outline-none placeholder:text-sw-text-ghost transition-colors focus:border-sw-border-focus"
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="password"
            className="block text-[11px] font-bold uppercase tracking-[0.06em] text-sw-text-muted"
          >
            비밀번호
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="h-10 w-full rounded-xl border border-sw-border-default bg-sw-bg-elevated px-3 text-sm text-sw-text-primary outline-none placeholder:text-sw-text-ghost transition-colors focus:border-sw-border-focus"
          />
        </div>

        <button
          type="submit"
          disabled={pending}
          className="mt-2 h-11 w-full rounded-xl font-bold transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: "var(--sw-cta)", color: "#fffaf1" }}
        >
          {pending ? "로그인 중..." : "로그인"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-sw-text-ghost">
        계정이 없으신가요?{" "}
        <Link
          href="/signup"
          className="font-bold hover:opacity-80"
          style={{ color: "var(--sw-accent)" }}
        >
          회원가입
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
