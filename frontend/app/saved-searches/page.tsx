"use client";

import { useEffect, useMemo, useState } from "react";
import { api, type AlertSummary, type SearchRow } from "../../lib/api";
import { useRouter } from "next/navigation";

function pillClass(status: string | null) {
  const s = (status || "").toLowerCase();
  if (s === "active") return "pill ok";
  if (s === "paused") return "pill warn";
  if (s === "deleted") return "pill bad";
  return "pill neutral";
}

export default function SavedSearchesPage() {
  const router = useRouter();
  const [rows, setRows] = useState<SearchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<Record<number, AlertSummary>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const data = await api.listSearches(200);
        if (!alive) return;
        setRows(data || []);
        setErr(null);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message || "Failed to load searches");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // fetch alert summary per search after initial load (non-blocking)
  useEffect(() => {
    let alive = true;
    (async () => {
      const ids = rows.map(r => r.id);
      for (const id of ids) {
        if (!alive) return;
        try {
          const s = await api.getAlertSummary(id);
          if (!alive) return;
          setSummaries(prev => ({ ...prev, [id]: s }));
        } catch {
          // ignore summary failures per-row
        }
      }
    })();
    return () => { alive = false; };
  }, [rows]);

  const sorted = useMemo(() => [...rows].sort((a,b) => b.id - a.id), [rows]);

  async function doRefresh(id: number) {
    try {
      setBusyId(id);
      setToast("Refreshing…");
      await api.refreshSearch(id);
      setToast("Refresh queued ✅");
      setTimeout(() => setToast(null), 2500);
    } catch (e:any) {
      setToast(null);
      alert(e?.message || "Refresh failed");
    } finally {
      setBusyId(null);
    }
  }

  async function doSendNow(id: number) {
    try {
      setBusyId(id);
      setToast("Sending…");
      const res = await api.sendNow(id, 25);
      // show skip reasons if present
      if (res?.skipped) {
        setToast(`Skipped: ${res?.reason || "unknown"}`);
      } else {
        setToast("Send complete ✅");
      }
      setTimeout(() => setToast(null), 3500);
      // refresh summary
      try {
        const s = await api.getAlertSummary(id);
        setSummaries(prev => ({ ...prev, [id]: s }));
      } catch {}
    } catch (e:any) {
      setToast(null);
      alert(e?.message || "Send failed");
    } finally {
      setBusyId(null);
    }
  }

  async function doDuplicate(id:number){
    try{
      setBusyId(id);
      const r = await api.duplicateSearch(id);
      setToast("Duplicated ✅");
      setTimeout(() => setToast(null), 2500);
      // reload list
      const data = await api.listSearches(200);
      setRows(data || []);
    } catch(e:any){
      alert(e?.message || "Duplicate failed");
    } finally {
      setBusyId(null);
    }
  }

  async function doDelete(id:number){
    if (!confirm("Delete this search? You can view deleted searches on the Deleted page.")) return;
    try{
      setBusyId(id);
      await api.deleteSearch(id);
      setToast("Deleted ✅");
      setTimeout(() => setToast(null), 2500);
      setRows(prev => prev.filter(r => r.id !== id));
    } catch(e:any){
      alert(e?.message || "Delete failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="page">
      <div className="pageHead">
        <div>
          <h1 className="h1">Saved searches</h1>
          <p className="muted">Live data + actions (refresh, send, edit, alerts).</p>
        </div>
        <div className="ctaRow">
          <a className="btn primary" href="/new-search">New search</a>
          <button className="btn" onClick={() => router.refresh()} disabled={loading}>Reload</button>
        </div>
      </div>

      {toast ? <div className="flash ok" style={{marginTop: 10}}>{toast}</div> : null}

      <div className="card">
        {loading ? (
          <div className="empty">Loading…</div>
        ) : err ? (
          <div className="empty">Error: {err}</div>
        ) : sorted.length === 0 ? (
          <div className="empty">No searches found yet.</div>
        ) : (
          <div className="list">
            {sorted.map((s) => {
              const summary = summaries[s.id];
              const disabled = busyId === s.id;
              return (
                <div key={s.id} className="rowCard">
                  <div className="rowTop">
                    <div className="rowTitle">
                      <span className="pill neutral">#{s.id}</span>
                      <span style={{fontWeight: 850}}>{s.search_item}</span>
                      <span className={pillClass(s.status)}>{(s.status || "—").toUpperCase()}</span>
                      <span className="pill neutral">{(s.plan_tier || "free").toUpperCase()}</span>
                    </div>
                    <div className="rowMeta muted">
                      {s.location ? <span>📍 {s.location}</span> : <span>📍 —</span>}
                      {s.max_price != null ? <span>💰 {s.max_price}</span> : <span>💰 —</span>}
                    </div>
                  </div>

                  <div className="rowActions">
                    <a className="btn" href={`/saved-searches/${s.id}`}>Details</a>
                    <a className="btn" href={`/saved-searches/${s.id}/results`}>Results</a>
                    <a className="btn" href={`/saved-searches/${s.id}/alerts`}>Alerts{summary ? ` (${summary.pending})` : ""}</a>
                    <a className="btn" href={`/saved-searches/${s.id}/edit`}>Edit</a>
                    <button className="btn" onClick={() => doRefresh(s.id)} disabled={disabled}>Refresh</button>
                    <button className="btn primary" onClick={() => doSendNow(s.id)} disabled={disabled}>Send now</button>
                    <button className="btn" onClick={() => doDuplicate(s.id)} disabled={disabled}>Duplicate</button>
                    <button className="btn" onClick={() => doDelete(s.id)} disabled={disabled}>Delete</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
