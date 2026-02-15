"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, type AlertRow, type AlertSummary } from "../../../../lib/api";

function num(x: any) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function normalizeSummary(s: any): AlertSummary {
  const c = s?.counts ?? s ?? {};
  return {
    pending: num(c?.pending ?? c?.pending_count ?? 0),
    sent: num(c?.sent ?? c?.sent_count ?? 0),
    dismissed: num(c?.dismissed ?? c?.dismissed_count ?? 0),
    error: num(c?.error ?? c?.error_count ?? 0),
  } as AlertSummary;
}

function pillClass(status: string) {
  const s = String(status || "").toLowerCase();
  if (s === "pending") return "pill warn";
  if (s === "sent") return "pill ok";
  if (s === "dismissed") return "pill neutral";
  if (s === "error") return "pill bad";
  return "pill neutral";
}

function fmtWhen(iso?: string | null) {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return String(iso);
  return new Date(t).toLocaleString();
}

function fmtPrice(price: any, currency?: string | null) {
  if (price == null || price === "") return "—";
  const c = (currency || "USD").toUpperCase();
  return `${c} ${price}`;
}

export default function AlertsPage({ params }: { params: { id: string } }) {
  const id = Number(params.id);

  const [status, setStatus] = useState<"pending" | "sent" | "dismissed" | "error" | "all">("pending");
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);

  const [rows, setRows] = useState<AlertRow[]>([]);
  const [summary, setSummary] = useState<AlertSummary | null>(null);

  const [loading, setLoading] = useState(true);
  const [busySend, setBusySend] = useState(false);

  const [alertEnabled, setAlertEnabled] = useState(true);

  const chips = useMemo(() => {
    const c = summary || { pending: 0, sent: 0, dismissed: 0, error: 0 };
    const total = c.pending + c.sent + c.dismissed + c.error;
    return [
      { key: "pending", label: "Pending", count: c.pending },
      { key: "sent", label: "Sent", count: c.sent },
      { key: "dismissed", label: "Dismissed", count: c.dismissed },
      { key: "error", label: "Error", count: c.error },
      { key: "all", label: "All", count: total },
    ] as const;
  }, [summary]);

  async function load() {
    setLoading(true);
    try {
      const sumRaw = await api.getAlertSummary(id);
      setSummary(normalizeSummary(sumRaw));

      const list = await api.listAlerts(id, status, limit, offset);
      setRows(Array.isArray(list) ? list : []);

      // load settings for enabling/disabling Send Now
      try {
        const s = await api.getAlertSettings(id);
        setAlertEnabled(!!s?.settings?.enabled);
      } catch {
        setAlertEnabled(true);
      }
    } finally {
      setLoading(false);
    }
  }

  async function toggleDismiss(alertId: number, current: string) {
    const cur = String(current || "").toLowerCase();
    const next = cur === "dismissed" ? "pending" : "dismissed";
    await api.patchAlertStatus(alertId, next);
    await load();
  }

  async function sendNow() {
    setBusySend(true);
    try {
      await api.sendNow(id, 25);
      await load();
    } catch (e: any) {
      alert(e?.message || "Send now failed");
    } finally {
      setBusySend(false);
    }
  }

  useEffect(() => {
    if (!Number.isFinite(id) || id <= 0) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, status, limit, offset]);

  return (
    <main className="page">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <div>
          <h1 className="h1" style={{ marginBottom: 6 }}>Alerts</h1>
          <div className="muted">Search #{id}</div>
        </div>

        <div className="row" style={{ gap: 10 }}>
          <Link className="btn" href={`/saved-searches/${id}`}>Back to details</Link>
          <Link className="btn" href={`/saved-searches/${id}/results`}>View results</Link>
          <button className="btn primary" onClick={sendNow} disabled={busySend || !alertEnabled} title={!alertEnabled ? "Alerts are disabled for this search" : ""}>
            {busySend ? "Sending…" : "Send now"}
          </button>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 14 }}>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          {chips.map((c) => (
            <button
              key={c.key}
              className={`btn ${status === c.key ? "primary" : ""}`}
              onClick={() => { setOffset(0); setStatus(c.key as any); }}
              type="button"
            >
              {c.label} <span style={{ opacity: 0.75 }}>({c.count})</span>
            </button>
          ))}
        </div>

        <div className="row" style={{ gap: 10, marginTop: 12, alignItems: "center" }}>
          <label className="muted">Limit</label>
          <input value={String(limit)} onChange={(e) => setLimit(Math.max(1, Number(e.target.value) || 50))} style={{ width: 90 }} />
          <label className="muted">Offset</label>
          <input value={String(offset)} onChange={(e) => setOffset(Math.max(0, Number(e.target.value) || 0))} style={{ width: 90 }} />
          <button className="btn" type="button" onClick={load} disabled={loading}>Refresh</button>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 14 }}>
        {loading ? <div className="muted">Loading…</div> : null}

        {!loading && rows.length === 0 ? (
          <div className="muted">No alerts for this status.</div>
        ) : null}

        {!loading && rows.length > 0 ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: 940, borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "10px 8px" }}>Alert ID</th>
                  <th style={{ textAlign: "left", padding: "10px 8px" }}>Status</th>
                  <th style={{ textAlign: "left", padding: "10px 8px" }}>Title</th>
                  <th style={{ textAlign: "left", padding: "10px 8px" }}>Price</th>
                  <th style={{ textAlign: "left", padding: "10px 8px" }}>Link</th>
                  <th style={{ textAlign: "left", padding: "10px 8px" }}>Created</th>
                  <th style={{ textAlign: "left", padding: "10px 8px" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a: any) => {
                  const mp = String(a.marketplace || "").toUpperCase();
                  const created = fmtWhen(a.alert_created_at || a.created_at || a.found_at);
                  const statusLabel = String(a.status || "—").toLowerCase();

                  return (
                    <tr key={a.alert_id}>
                      <td style={{ padding: "10px 8px", borderTop: "1px solid rgba(38,43,63,0.7)" }}>
                        <span className="mono">{a.alert_id}</span>
                      </td>
                      <td style={{ padding: "10px 8px", borderTop: "1px solid rgba(38,43,63,0.7)" }}>
                        <span className={pillClass(statusLabel)}>{statusLabel.toUpperCase()}</span>
                      </td>
                      <td style={{ padding: "10px 8px", borderTop: "1px solid rgba(38,43,63,0.7)" }}>
                        <div style={{ fontWeight: 800 }}>{a.title || "—"}</div>
                        <div className="muted" style={{ marginTop: 4 }}>
                          {mp ? `(${mp}) ` : ""}
                          {a.external_id ? <span className="mono">{a.external_id}</span> : null}
                        </div>
                      </td>
                      <td style={{ padding: "10px 8px", borderTop: "1px solid rgba(38,43,63,0.7)" }}>
                        <span className="mono">{fmtPrice(a.price, a.currency)}</span>
                      </td>
                      <td style={{ padding: "10px 8px", borderTop: "1px solid rgba(38,43,63,0.7)" }}>
                        {a.listing_url ? (
                          <a className="btn" href={a.listing_url} target="_blank" rel="noopener">
                            Open
                          </a>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td style={{ padding: "10px 8px", borderTop: "1px solid rgba(38,43,63,0.7)" }}>
                        <span className="mono">{created}</span>
                      </td>
                      <td style={{ padding: "10px 8px", borderTop: "1px solid rgba(38,43,63,0.7)" }}>
                        <button className="btn" type="button" onClick={() => toggleDismiss(a.alert_id, a.status)}>
                          {String(a.status || "").toLowerCase() === "dismissed" ? "Undo dismiss" : "Dismiss"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </main>
  );
}
