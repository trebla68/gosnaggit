"use client";

import { useEffect, useState } from "react";
import { api, type AlertSummary, type SearchRow } from "../../../lib/api";

function num(x: any) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function normalizeSummary(s: any): AlertSummary {
  // Handles different possible backend shapes safely
  return {
    pending: num(s?.pending ?? s?.pending_count ?? 0),
    sent: num(s?.sent ?? s?.sent_count ?? 0),
    dismissed: num(s?.dismissed ?? s?.dismissed_count ?? 0),
    error: num(s?.error ?? s?.error_count ?? 0),
  } as AlertSummary;
}

function pill(status?: string | null) {
  const v = (status || "").toLowerCase();
  if (v === "active") return "pill ok";
  if (v === "paused") return "pill warn";
  if (v === "deleted" || v === "cancelled") return "pill bad";
  return "pill neutral";
}

export default function SearchDetail({ params }: { params: { id: string } }) {
  const id = Number(params.id);

  const [search, setSearch] = useState<SearchRow | null>(null);
  const [summary, setSummary] = useState<AlertSummary | null>(null);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const [s, sum] = await Promise.all([
          api.getSearch(id),
          api.getAlertSummary(id).catch(() => null),
        ]);

        if (!alive) return;
        setSearch(s);
        setSummary(sum ? normalizeSummary(sum) : normalizeSummary(null));
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message || "Failed to load search");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [id]);

  async function doRefresh() {
    try {
      setBusy(true);
      setToast("Refreshing…");
      await api.refreshSearch(id);
      setToast("Refresh queued ✅  (checking Results in 2s)");
      setTimeout(() => {
        window.location.href = `/saved-searches/${id}/results`;
      }, 2000);
    } catch (e: any) {
      setToast(null);
      alert(e?.message || "Refresh failed");
    } finally {
      setBusy(false);
    }
  }


  async function doSendNow() {
    try {
      setBusy(true);
      setToast("Sending…");
      const res = await api.sendNow(id, 25);

      if (res?.skipped) {
        setToast(`Skipped: ${res?.reason || "unknown"}`);
      } else {
        setToast("Send complete ✅");
      }
      setTimeout(() => setToast(null), 3500);

      // refresh alert summary after sending
      try {
        const sum = await api.getAlertSummary(id).catch(() => null);
        setSummary(normalizeSummary(sum));
      } catch { }
    } catch (e: any) {
      setToast(null);
      alert(e?.message || "Send failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <div className="pageHead">
        <div>
          <h1 className="h1">Search #{id}</h1>
          <p className="muted">Details + quick actions + alert counts.</p>
        </div>
        <div className="ctaRow">
          <a className="btn" href={`/saved-searches/${id}/edit`}>Edit</a>
          <a className="btn" href={`/saved-searches/${id}/results`}>Results</a>
          <a className="btn" href={`/saved-searches/${id}/alerts`}>Alerts</a>
          <a className="btn" href="/saved-searches">Back</a>
        </div>
      </div>

      {toast ? <div className="flash ok" style={{ marginTop: 10 }}>{toast}</div> : null}

      <div className="card">
        {loading ? (
          <div className="empty">Loading…</div>
        ) : err ? (
          <div className="empty">Error: {err}</div>
        ) : !search ? (
          <div className="empty">Not found.</div>
        ) : (
          <div className="rowCard">
            <div className="rowTop" style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div className="rowTitle" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontWeight: 900, fontSize: 20 }}>{search.search_item}</span>
                <span className="pill neutral">{(search.plan_tier || "free").toUpperCase()}</span>
                <span className={pill(search.status)}>{(search.status || "—").toUpperCase()}</span>
              </div>

              <div className="ctaRow">
                <button className="btn" onClick={doRefresh} disabled={busy}>Refresh</button>
                <button className="btn primary" onClick={doSendNow} disabled={busy}>Send now</button>
              </div>
            </div>

            <div className="rowMeta muted" style={{ marginTop: 10, display: "flex", gap: 14, flexWrap: "wrap" }}>
              <span>📍 {search.location || "—"}</span>
              <span>🏷️ {search.category || "—"}</span>
              <span>💰 {search.max_price ?? "—"}</span>
              {"next_refresh_at" in (search as any) && (search as any).next_refresh_at ? (
                <span>⏰ Next: {String((search as any).next_refresh_at)}</span>
              ) : null}
            </div>

            <div className="rowActions" style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span className="pill ok">Pending: {summary?.pending ?? 0}</span>
              <span className="pill neutral">Sent: {summary?.sent ?? 0}</span>
              <span className="pill neutral">Dismissed: {summary?.dismissed ?? 0}</span>
              <span className="pill bad">Error: {summary?.error ?? 0}</span>
            </div>

            <div className="muted" style={{ marginTop: 12, fontSize: 13 }}>
              Tip: If you don’t see new results, hit <strong>Refresh</strong> (queues a refresh job), then check <strong>Results</strong>.
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
