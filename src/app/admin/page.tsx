"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/useAuth";

interface Status {
  configured: boolean;
  expiresAt?: string | null;
  expired?: boolean | null;
}

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const [status, setStatus] = useState<Status | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [cookieInput, setCookieInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    fetch("/api/admin/settings").then((r) => {
      if (r.status === 403) {
        setForbidden(true);
        return null;
      }
      return r.json();
    }).then((data) => data && setStatus(data));
  }, [user]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cookie: cookieInput.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to save");
      }
      setCookieInput("");
      setMessage("Saved. New requests will use this session.");
      const s = await fetch("/api/admin/settings").then((r) => r.json());
      setStatus(s);
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (authLoading) {
    return <main className="mx-auto max-w-lg px-6 py-14 text-zinc-400">Loading…</main>;
  }

  if (!user) {
    return (
      <main className="mx-auto max-w-lg px-6 py-14 text-center text-zinc-400">
        <p>Sign in through Steam to access this page.</p>
      </main>
    );
  }

  if (forbidden) {
    return (
      <main className="mx-auto max-w-lg px-6 py-14 text-center text-zinc-400">
        <p>This page is only available to the app owner.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-lg flex-col gap-6 px-6 py-14">
      <h1 className="text-xl font-semibold text-zinc-50">Steam session cookie</h1>
      <p className="text-sm text-zinc-500">
        Used to fetch order books in your account&apos;s real VND pricing
        instead of an approximation. Stored encrypted — never shown here
        once saved, and never sent to the browser.
      </p>

      {status && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            !status.configured
              ? "border-zinc-700 text-zinc-400"
              : status.expired
                ? "border-red-500/30 bg-red-500/10 text-red-400"
                : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
          }`}
        >
          {!status.configured
            ? "No cookie configured — order books fall back to an approximate VND conversion."
            : status.expired
              ? `Expired at ${new Date(status.expiresAt!).toLocaleString()} — please refresh it below.`
              : `Active, expires ${new Date(status.expiresAt!).toLocaleString()}.`}
        </div>
      )}

      <form onSubmit={handleSave} className="flex flex-col gap-3">
        <label className="text-xs font-medium text-zinc-400">
          steamLoginSecure value
        </label>
        <textarea
          value={cookieInput}
          onChange={(e) => setCookieInput(e.target.value)}
          rows={4}
          placeholder="76561198...%7C%7CeyJ..."
          className="rounded-xl border border-white/[0.08] bg-zinc-900/80 p-3 font-mono text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500/50 focus:outline-none"
        />
        <button
          type="submit"
          disabled={saving || !cookieInput.trim()}
          className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {message && <p className="text-xs text-zinc-400">{message}</p>}
      </form>

      <details className="text-xs text-zinc-600">
        <summary className="cursor-pointer">How to get this value</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-4">
          <li>Open steamcommunity.com, signed in</li>
          <li>DevTools (F12) → Application → Cookies → steamcommunity.com</li>
          <li>Copy the value of <code>steamLoginSecure</code></li>
        </ol>
      </details>
    </main>
  );
}
