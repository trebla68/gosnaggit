"use client";

import React, { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";

function SignupInner() {
    const sp = useSearchParams();
    const next = sp.get("next") || "/saved-searches";

    const [displayName, setDisplayName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            const res = await fetch("/api/signup", {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                },
                body: JSON.stringify({
                    displayName,
                    email,
                    password,
                }),
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok || !data?.ok) {
                setError(data?.error || "Signup failed.");
                setLoading(false);
                return;
            }

            const loginRes = await signIn("credentials", {
                email,
                password,
                redirect: false,
            });

            if (loginRes?.error) {
                setError("Account created, but automatic login failed. Please log in.");
                setLoading(false);
                return;
            }

            window.location.href = next;
        } catch (err) {
            setError("Signup failed.");
            setLoading(false);
        }
    }

    return (
        <main className="page">
            <h1 className="h1">Create your account</h1>
            <p className="muted">Create an account to save searches and enable alerts.</p>

            <div className="card" style={{ marginTop: 14 }}>
                <form onSubmit={handleSubmit} style={{ display: "grid", gap: 10 }}>
                    <input
                        type="text"
                        placeholder="Display name (optional)"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                    />

                    <input
                        type="email"
                        placeholder="Email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />

                    <input
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        minLength={8}
                        required
                    />

                    <button className="btn primary" type="submit" disabled={loading}>
                        {loading ? "Creating account..." : "Create account"}
                    </button>
                </form>

                {error && <p style={{ color: "red", marginTop: 10 }}>{error}</p>}

                <div style={{ marginTop: 14 }}>
                    After signup, you’ll be sent to: <strong>{next}</strong>
                </div>

                <div style={{ marginTop: 12 }}>
                    <a className="btn" href={`/login?next=${encodeURIComponent(next)}`}>
                        Already have an account? Log in
                    </a>
                </div>
            </div>

            <style jsx>{`
        .page { padding: 18px; }
        .h1 { margin: 0 0 6px 0; font-size: 22px; font-weight: 900; }
        .muted { opacity: 0.8; }
        .card {
          padding: 14px;
          border-radius: var(--radius);
          border: 1px solid var(--panel-border);
          background: var(--panel);
        }
      `}</style>
        </main>
    );
}

export default function SignupPage() {
    return (
        <Suspense fallback={<div className="page">Loading…</div>}>
            <SignupInner />
        </Suspense>
    );
}