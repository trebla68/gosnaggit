"use client";

import { useEffect, useState } from "react";
import { api } from "../../lib/api";

type Mode = "login" | "signup";

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
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    setBusy(false);
    setMode("login");
  }, [open]);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const e = email.trim();
      if (!e) throw new Error("Email is required");
      if (!password) throw new Error("Password is required");

      if (mode === "login") {
        await api.login(e, password);
      } else {
        await api.signup(e, password);
      }

      onClose();
      onAuthed?.();
    } catch (e: any) {
      setErr(e?.message || "Auth failed");
    } finally {
      setBusy(false);
    }
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
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
          <div style={{ fontSize: 20, fontWeight: 900 }}>
            {mode === "login" ? "Log in" : "Create account"}
          </div>
          <button className="btn" type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <p className="muted" style={{ marginTop: 6 }}>
          {reason || "To run more searches or set up alerts, please log in."}
        </p>

        <div className="panel" style={{ marginTop: 10 }}>
          <label>Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />

          <div style={{ marginTop: 10 }}>
            <label>Password</label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              type="password"
            />
          </div>

          {err ? (
            <div className="flash bad" style={{ marginTop: 10 }}>
              {err}
            </div>
          ) : null}

          <div className="ctaRow" style={{ marginTop: 12 }}>
            <button className="btn primary" type="button" disabled={busy} onClick={submit}>
              {busy ? "Working…" : mode === "login" ? "Log in" : "Create account"}
            </button>
            <button
              className="btn"
              type="button"
              disabled={busy}
              onClick={() => setMode((m) => (m === "login" ? "signup" : "login"))}
            >
              {mode === "login" ? "Need an account?" : "Already have an account?"}
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
