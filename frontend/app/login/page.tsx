"use client";

import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

export default function LoginPage() {
    const sp = useSearchParams();
    const router = useRouter();
    const next = sp.get("next") || "/saved-searches";

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        try {
            const res = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ email, password }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error(data?.error || "Login failed");
            router.push(next);
        } catch (e: any) {
            setErr(String(e?.message || e));
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="container" style={{ maxWidth: 520 }}>
            <h1>Log in</h1>
            <p className="muted">Access your saved searches and alerts.</p>

            {err ? <div className="flash bad">{err}</div> : null}

            <form onSubmit={onSubmit} className="card" style={{ padding: 16 }}>
                <label className="label">Email</label>
                <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} />

                <div style={{ height: 10 }} />

                <label className="label">Password</label>
                <input
                    className="input"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                />

                <div style={{ height: 14 }} />

                <button className="btn primary" disabled={busy}>
                    {busy ? "Logging in..." : "Log in"}
                </button>

                <div style={{ height: 10 }} />

                <a className="btn" href={`/signup?next=${encodeURIComponent(next)}`}>
                    Need an account? Create one
                </a>
            </form>
        </div>
    );
}