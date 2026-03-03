"use client";

import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

export default function SignupPage() {
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
            const res = await fetch("/api/auth/register", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ email, password }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error(data?.error || "Sign up failed");
            router.push(next);
        } catch (e: any) {
            setErr(String(e?.message || e));
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="container" style={{ maxWidth: 520 }}>
            <h1>Create account</h1>
            <p className="muted">Save searches and enable alerts.</p>

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
                    {busy ? "Creating..." : "Create account"}
                </button>

                <div style={{ height: 10 }} />

                <a className="btn" href={`/login?next=${encodeURIComponent(next)}`}>
                    Already have an account? Log in
                </a>
            </form>
        </div>
    );
}