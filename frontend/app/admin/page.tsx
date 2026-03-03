"use client";

import { useEffect, useState } from "react";
import { api } from "../lib/api";

export default function AdminPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const r = await fetch("/api/admin/searches", { credentials: "include" });
        const txt = await r.text();
        if (!r.ok) throw new Error(`API ${r.status}: ${txt}`);
        const json = txt ? JSON.parse(txt) : null;
        if (!alive) return;
        setRows(json?.rows || json || []);
      } catch (e: any) {
        const msg = String(e?.message || e);
        if (msg.includes("API 401") || msg.includes("API 403")) {
          window.dispatchEvent(new CustomEvent("gs-auth-required", { detail: { reason: "Admin access required." } }));
          setRows([]);
          setErr(null);
          setLoading(false);
          return;
        }
        setErr(msg);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <main className="page">
      <h1 className="h1">Admin</h1>
      <p className="muted">All searches (admin-only).</p>

      {loading ? <p>Loading…</p> : null}
      {err ? <div className="flash bad">{err}</div> : null}

      <div className="panel" style={{ marginTop: 12 }}>
        <table className="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Search</th>
              <th>Status</th>
              <th>Tier</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={String(r.id)}>
                <td>{r.id}</td>
                <td>{r.search_item}</td>
                <td>{r.status}</td>
                <td>{r.plan_tier}</td>
                <td>{r.created_at ? new Date(r.created_at).toLocaleString() : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
