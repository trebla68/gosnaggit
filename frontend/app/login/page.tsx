"use client";

import React, { Suspense } from "react";
import { useSearchParams } from "next/navigation";

function LoginInner() {
    const sp = useSearchParams();
    const next = sp.get("next") || "/saved-searches";

    // Your existing UI can stay the same — only change is we read search params here.
    // If you already have a login form wired up, keep it and just make sure it uses `next`.

    return (
        <main className="page">
            <h1 className="h1">Log in</h1>
            <p className="muted">Log in to view saved searches and manage alerts.</p>

            {/* Example placeholder */}
            <div className="card" style={{ marginTop: 14 }}>
                <div style={{ marginBottom: 10 }}>
                    After logging in, you’ll be sent to: <strong>{next}</strong>
                </div>
                <a className="btn primary" href={`/signup?next=${encodeURIComponent(next)}`}>
                    Create account instead
                </a>
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