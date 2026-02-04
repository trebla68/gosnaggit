"use client";

import { useEffect, useMemo, useState } from "react";
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


function fmtPrice(price: any, currency?: string | null) {
  if (price === null || price === undefined || price === "") return "—";
  const n = Number(price);
  if (Number.isFinite(n)) {
    try {
      if (currency) {
        return new Intl.NumberFormat(undefined, {
          style: "currency",
          currency,
          maximumFractionDigits: 2,
        }).format(n);
      }
    } catch { }
    return n.toFixed(2);
  }
  return String(price);
}

function fmtWhen(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

function statusPill(status?: string | null) {
  const s = (status || "").toLowerCase();
  if (s === "pending") return "pill ok";
  if (s === "error") return "pill bad";
  if (s === "dismissed") return "pill neutral";
  if (s === "sent") return "pill neutral";
  return "pill neutral";
}

export default function AlertsPage({ params }: { params: { id: string } }) {
  const id = Number(params.id);

  const [summary, setSummary] = useState<AlertSummary>(normalizeSummary(null));
  const [status, setStatus] = useState<"all" | "pending" | "sent" | "dismissed" | "error">("all");
  const [rows, setRows] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    setErr(null);
    try {
      const [sum, list] = await Promise.all([
        api.getAlertSummary(id).catch(() => null),
        api.listAlerts(id, status, 200, 0),
      ]);
      setSummary(normalizeSummary(sum));
      setRows(Array.isArray(list) ? list : []);
    } catch (e: any) {
      setErr(e?.message || "Failed to load alerts");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, status]);

  async function dismiss(alertId: number) {
    try {
      setBusy(true);
      setToast("Dismissing…");
      await api.patchAlertStatus(alertId, "dismissed");
      setToast("Dismissed ✅");
      setTimeout(() => setToast(null), 1500);
      await reload();
    } catch (e: any) {
      setToast(null);
      alert(e?.message || "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function sendNow() {
    try {
      setBusy(true);
      setToast("Sending…");
      const res = await api.sendNow(id, 25);
      if (res?.skipped) {
        setToast(`Skipped: ${res?.reason || "unknown"}`);
      } else {
        setToast("Send complete ✅");
      }
      setTimeout(() => setToast(null), 2500);
      await reload();
    } catch (e: any) {
      setToast(null);
      alert(e?.message || "Send failed");
    } finally {
      setBusy(false);
    }
  }

  const filteredCount = rows.length;

  const sorted = useMemo(() => {
    const copy = [...rows];
    // Prefer newest first if the row has a timestamp-like field; fallback stable.
    copy.sort((a: any, b: any) => {
      const ta = Date.parse(a?.alert_created_at || a?.created_at || a?.found_at || "") || 0;
      const tb = Date.parse(b?.alert_created_at || b?.created_at || b?.found_at || "") || 0;
      return tb - ta;
    });
    return copy;
  }, [rows]);

  return (
    <main className="page">
      <div className="pageHead">
        <div>
          <h1 className="h1">Alerts for #{id}</h1>
          <p className="muted">
            Pending / sent / dismissed alerts • {loading ? "Loading…" : `${filteredCount} shown`}
          </p>
        </div>
        <div className="ctaRow">
          <a className="btn" href={`/saved-searches/${id}`}>Details</a>
          <a className="btn" href={`/saved-searches/${id}/results`}>Results</a>
          <button className="btn primary" onClick={sendNow} disabled={busy}>Send now</button>
          <a className="btn" href="/saved-searches">Back</a>
        </div>
      </div>

      {toast ? <div className="flash ok" style={{ marginTop: 10 }}>{toast}</div> : null}

      <div className="rowActions" style={{ marginTop: 10 }}>
        <span className="pill ok">Pending: {summary.pending}</span>
        <span className="pill neutral">Sent: {summary.sent}</span>
        <span className="pill neutral">Dismissed: {summary.dismissed}</span>
        <span className="pill bad">Error: {summary.error}</span>
      </div>

      <div className="panel" style={{ marginTop: 14 }}>
        <label>Status filter</label>
        <div className="ctaRow" style={{ marginTop: 6, flexWrap: "wrap" }}>
          {(["all", "pending", "sent", "dismissed", "error"] as const).map((s) => (
            <button
              key={s}
              className={"btn" + (status === s ? " primary" : "")}
              onClick={() => setStatus(s)}
              disabled={busy}
              type="button"
            >
              {s}
            </button>
          ))}
          <button className="btn" onClick={reload} disabled={busy} type="button">Reload</button>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div className="empty">Loading…</div>
        ) : err ? (
          <div className="empty">Error: {err}</div>
        ) : sorted.length === 0 ? (
          <div className="empty">No alerts for this filter.</div>
        ) : (
          <div className="alertsGrid">
            {sorted.map((a: any) => {
              const when = fmtWhen(a?.alert_created_at || a?.created_at || a?.found_at);
              const priceLabel = fmtPrice(a?.price, a?.currency);
              const mp = (a?.marketplace || "").toUpperCase();

              return (
                <div className="alertCard" key={a.alert_id}>
                  <div className="alertMedia">
                    {a.image_url ? (
                      <img
                        src={a.image_url}
                        alt={a.title || "Alert image"}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="alertMediaFallback">
                        <span>no image</span>
                      </div>
                    )}
                  </div>

                  <div className="alertBody">
                    <div className="alertTop">
                      <span className={statusPill(a.status)}>{(a.status || "—").toUpperCase()}</span>
                      {mp ? <span className="pill neutral">{mp}</span> : null}
                      {a.condition ? <span className="pill neutral">{a.condition}</span> : null}
                      {a.location ? <span className="pill neutral">{a.location}</span> : null}
                    </div>

                    <div className="alertTitle" title={a.title || ""}>
                      {a.title || "—"}
                    </div>

                    <div className="alertMeta">
                      <div className="alertPrice">{priceLabel}</div>
                      <div className="alertSub muted">
                        {a.seller_username ? <span>Seller: {a.seller_username}</span> : <span />}
                        {when ? <span>{when}</span> : null}
                      </div>
                    </div>

                    <div className="alertActions">
                      {a.listing_url ? (
                        <a className="btn btnSmall" href={a.listing_url} target="_blank" rel="noreferrer">
                          Open
                        </a>
                      ) : (
                        <span className="muted">No link</span>
                      )}

                      {a.status !== "dismissed" ? (
                        <button
                          className="btn btnSmall btnGhost"
                          onClick={() => dismiss(a.alert_id)}
                          disabled={busy}
                          type="button"
                        >
                          Dismiss
                        </button>
                      ) : (
                        <span className="muted">Dismissed</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style jsx global>{`
        .alertsGrid{
          display:grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 14px;
        }
        .alertCard{
          display:grid;
          grid-template-columns: 120px 1fr;
          gap: 12px;
          padding: 12px;
          border: 1px solid rgba(0,0,0,.08);
          border-radius: 14px;
          background: rgba(255,255,255,.65);
          box-shadow: 0 8px 20px rgba(0,0,0,.06);
        }
        .alertMedia{
          width: 120px;
          height: 120px;
          border-radius: 12px;
          overflow:hidden;
          background: rgba(255,255,255,.75);
          border: 1px solid rgba(0,0,0,.08);
          display:flex;
          align-items:center;
          justify-content:center;
        }
        .alertMedia img{
          width:100%;
          height:100%;
          object-fit: cover;
          display:block;
        }
        .alertMediaFallback{
          width:100%;
          height:100%;
          display:flex;
          align-items:center;
          justify-content:center;
          font-size: 12px;
          color: rgba(0,0,0,.45);
          text-transform: uppercase;
          letter-spacing: .08em;
        }
        .alertBody{
          min-width:0;
          display:flex;
          flex-direction:column;
          gap: 8px;
        }
        .alertTop{
          display:flex;
          flex-wrap:wrap;
          gap:6px;
          align-items:center;
        }
        .pill{
          display:inline-flex;
          align-items:center;
          padding: 4px 10px;
          border-radius: 999px;
          font-size: 12px;
          border: 1px solid rgba(0,0,0,.12);
          background: rgba(255,255,255,.85);
        }
        .pill-ok{ background: rgba(186, 230, 186, .65); }
        .pill-bad{ background: rgba(255, 186, 186, .65); }
        .pill-neutral{ background: rgba(255,255,255,.75); }
        .alertTitle{
          font-weight: 800;
          line-height: 1.25;
          font-size: 15px;
          overflow:hidden;
          display:-webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
        }
        .alertMeta{
          display:flex;
          align-items:flex-end;
          justify-content: space-between;
          gap: 12px;
        }
        .alertPrice{
          font-weight: 900;
          font-size: 16px;
        }
        .alertSub{
          display:flex;
          flex-direction:column;
          gap:2px;
          text-align:right;
          font-size:12px;
        }
        .alertActions{
          display:flex;
          gap:8px;
          align-items:center;
        }
        .btnSmall{
          padding: 8px 12px;
          border-radius: 999px;
          font-size: 13px;
        }
        .btnGhost{
          background: rgba(255,255,255,.55);
        }
      `}</style>
    </main>
  );
}
