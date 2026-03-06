"use client";

import React, { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";

function LoginInner() {
    const sp = useSearchParams();
    const next = sp.get("next") || "/saved-searches";

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();

        const res = await signIn("credentials", {
            email,
            password,
            redirect: false,
        });

        if (res?.error) {
            setError("Invalid email or password.");
        } else {
            window.location.href = next;
        }
    }

    return (
        <main className="page">
            <h1 className="h1">Log in</h1>
            <p className="muted">Log in to view saved searches and manage alerts.</p>

            <div className="card" style={{ marginTop: 14 }}>
                <form onSubmit={handleSubmit} style={{ display: "grid", gap: 10 }}>
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
                        required
                    />

                    <button className="btn primary" type="submit">
                        Log in
                    </button>
                </form>

                {error && <p style={{ color: "red", marginTop: 10 }}>{error}</p>}

                <div style={{ marginTop: 14 }}>
                    After logging in, you’ll be sent to: <strong>{next}</strong>
                </div>

                <div style={{ marginTop: 12 }}>
                    <a className="btn primary" href={`/signup?next=${encodeURIComponent(next)}`}>
                        Create account instead
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

export default function LoginPage() {
    return (
        <Suspense fallback={<div className="page">Loading…</div>}>
            <LoginInner />
        </Suspense>
    );
}