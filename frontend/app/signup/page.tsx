"use client";

import React, { Suspense } from "react";
import { useSearchParams } from "next/navigation";

function SignupInner() {
    const sp = useSearchParams();
    const next = sp.get("next") || "/saved-searches";

    return (
        <main className="page">
            <h1 className="h1">Create your account</h1>
            <p className="muted">Create an account to save searches and enable alerts.</p>

            {/* Example placeholder */}
            <div className="card" style={{ marginTop: 14 }}>
                <div style={{ marginBottom: 10 }}>
                    After signup, you’ll be sent to: <strong>{next}</strong>
                </div>
                <a className="btn" href={`/login?next=${encodeURIComponent(next)}`}>
                    Already have an account? Log in
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

export default function SignupPage() {
    return (
        <Suspense fallback={<div className="page">Loading…</div>}>
            <SignupInner />
        </Suspense>
    );
}