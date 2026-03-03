"use client";

import { useState } from "react";

export default function Register() {
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [notes, setNotes] = useState("");
    const [status, setStatus] = useState<"idle" | "sending" | "ok" | "err">("idle");
    const [msg, setMsg] = useState<string>("");

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        setStatus("sending");
        setMsg("");

        try {
            const res = await fetch("/api/registrations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, email, notes }),
            });

            if (!res.ok) {
                const t = await res.text().catch(() => "");
                throw new Error(t || `HTTP ${res.status}`);
            }

            setStatus("ok");
            setMsg("Submitted. If email sending is enabled, you should receive it shortly.");
            setName("");
            setEmail("");
            setNotes("");
        } catch (err: any) {
            setStatus("err");
            setMsg(String(err?.message || err));
        }
    }

    return (
        <div className="section" style={{ maxWidth: 720 }}>
            <h1>Register for Beta</h1>
            <p className="muted">
                For now, registrations are sent to info@gosnaggit.com. Later, this will become full user accounts + payments.
            </p>

            <form onSubmit={onSubmit} className="card" style={{ padding: 18, marginTop: 14 }}>
                <label style={{ display: "block", marginBottom: 10 }}>
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>Name (optional)</div>
                    <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
                </label>

                <label style={{ display: "block", marginBottom: 10 }}>
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>Email *</div>
                    <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </label>

                <label style={{ display: "block", marginBottom: 14 }}>
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>Notes (optional)</div>
                    <textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} />
                </label>

                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <button className="btn primary" type="submit" disabled={status === "sending"}>
                        {status === "sending" ? "Sending…" : "Submit"}
                    </button>
                    <a className="btn" href="/pricing">View pricing</a>
                </div>

                {msg ? (
                    <div style={{ marginTop: 12 }} className={status === "err" ? "flash bad" : "flash ok"}>
                        {msg}
                    </div>
                ) : null}
            </form>
        </div>
    );
}
