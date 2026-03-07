"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";

export default function AuthModal({
  open,
  onClose,
  reason,
  onAuthed,
}: {
  open: boolean;
  onClose: () => void;
  reason?: string | null;
  onAuthed?: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    setBusy(false);
    setEmail("");
    setPassword("");
  }, [open]);

  async function submit() {
    setBusy(true);
    setErr(null);

    try {
      const e = email.trim();
      if (!e) throw new Error("Email is required");
      if (!password) throw new Error("Password is required");

      const res = await signIn("credentials", {
        email: e,
        password,
        redirect: false,
      });

      if (res?.error) {
        throw new Error("Invalid email or password.");
      }

      onClose();
      onAuthed?.();
      window.location.reload();
    } catch (e: any) {
      setErr(e?.message || "Login failed");
    } finally {
      setBusy(false);
    }
  }

  function goToSignup() {
    const next =
      typeof window !== "undefined"
        ? window.location.pathname + window.location.search
        : "/saved-searches";

    window.location.href = `/signup?next=${encodeURIComponent(next)}`;
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="card" style={{ width: "min(520px, 100%)", padding: 16 }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 900 }}>Log in</div>
          <button className="btn" type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <p className="muted" style={{ marginTop: 6 }}>
          {reason || "To continue, please log in."}
        </p>

        <div className="panel" style={{ marginTop: 10 }}>
          <label>Email</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
          />

          <div style={{ marginTop: 10 }}>
            <label>Password</label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              type="password"
              autoComplete="current-password"
            />
          </div>

          {err ? (
            <div className="flash bad" style={{ marginTop: 10 }}>
              {err}
            </div>
          ) : null}

          <div className="ctaRow" style={{ marginTop: 12 }}>
            <button className="btn primary" type="button" disabled={busy} onClick={submit}>
              {busy ? "Working…" : "Log in"}
            </button>

            <button className="btn" type="button" disabled={busy} onClick={goToSignup}>
              Need an account?
            </button>
          </div>

          <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>
            Beta note: This is a simple MVP login. We’ll add password reset and magic links later.
          </div>
        </div>
      </div>
    </div>
  );
}