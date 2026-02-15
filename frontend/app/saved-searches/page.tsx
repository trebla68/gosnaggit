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

function hasNewResults(last_found_at: string | null | undefined, hours = 24) {
  if (!last_found_at) return false;
  const t = Date.parse(last_found_at);
  if (!Number.isFinite(t)) return false;
  const ageMs = Date.now() - t;
  return ageMs >= 0 && ageMs <= hours * 60 * 60 * 1000;
}

export default function SavedSearchesPage() {
  const router = useRouter();

  const [rows, setRows] = useState<SearchRow[]>([]);
  const [summaries, setSummaries] = useState<Record<string, AlertSummary>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr(null);

    (async () => {
      try {
        const list = await api.listSearches({ limit: 200 });
        if (!alive) return;

        setRows(list || []);

        // fetch summaries (best-effort)
        const next: Record<string, AlertSummary> = {};
        await Promise.all(
          (list || []).map(async (s) => {
            try {
              const sum = await api.getAlertsSummary(Number(s.id));
              next[String(s.id)] = sum;
            } catch {
              // ignore per-row errors
            }
          })
        );

        if (!alive) return;
        setSummaries(next);
        setLoading(false);
      } catch (e: any) {
        if (!alive) return;
        setErr(String(e?.message || e));
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const active = useMemo(() => rows.filter((r) => String(r.status || "").toLowerCase() !== "deleted"), [rows]);
  const deleted = useMemo(() => rows.filter((r) => String(r.status || "").toLowerCase() === "deleted"), [rows]);

  async function onDelete(id: number) {
    setBusyId(id);
    try {
      await api.deleteSearch(id);
      router.refresh?.();
      // local update for instant UX
      setRows((prev) => prev.map((r) => (Number(r.id) === id ? { ...r, status: "deleted" } : r)));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="section">
      <div className="shell">
        <h1>Saved Searches</h1>
        <p className="muted">Your saved items. Tap a row for details, results, and alerts.</p>

        <div className="rowActions" style={{ marginTop: 12 }}>
          <a className="btn primary" href="/new-search">
            + New search
          </a>
          <a className="btn" href="/deleted">
            Deleted
          </a>
        </div>

        {err ? <div className="flash bad">{err}</div> : null}

        {loading ? (
          <div className="card" style={{ marginTop: 14 }}>
            Loading…
          </div>
        ) : (
          <>
            <div className="grid" style={{ marginTop: 14 }}>
              {active.map((s) => {
                const sum = summaries[String(s.id)];
                const disabled = busyId === s.id;
                const isNew = hasNewResults(s.last_found_at || s.created_at, 48);
                return (
                  <div key={s.id} className="rowCard">
                    <div className="rowTop">
                      <div className="rowTitle">
                        <span className="pill neutral">#{s.id}</span>
                        <span style={{ fontWeight: 850 }}>{s.search_item}</span>

                        {isNew ? (
                          <div style={{ display: "grid", gap: 4, alignItems: "start" }}>
                            <span
                              className="pill bad"
                              title="New results recently found"
                              style={{
                                background: "rgba(193, 18, 31, 0.22)",
                                borderColor: "rgba(193, 18, 31, 0.60)",
                                color: "rgba(255,255,255,0.95)",
                                letterSpacing: "0.08em",
                              }}
                            >
                              NEW
                            </span>
                            <a
                              href={`/saved-searches/${s.id}/results?focus=new`}
                              style={{ fontSize: 12, fontWeight: 700, opacity: 0.9, textDecoration: "underline" }}
                            >
                              View new →
                            </a>
                          </div>
                        ) : null}

                        <span className={pillClass(s.status)}>{(s.status || "—").toUpperCase()}</span>
                        <span className="pill neutral">{(s.marketplace || "All").toString()}</span>
                      </div>

                      <div className="rowBtns">
                        <a className="btn" href={`/saved-searches/${s.id}`}>
                          Details
                        </a>
                        <a className="btn" href={`/saved-searches/${s.id}/results`}>
                          Results
                        </a>
                        <a className="btn" href={`/saved-searches/${s.id}/alerts`}>
                          Alerts
                        </a>
                        <button className="btn danger" disabled={disabled} onClick={() => onDelete(Number(s.id))}>
                          {disabled ? "Deleting…" : "Delete"}
                        </button>
                      </div>
                    </div>

                    <div className="rowMeta">
                      <div className="muted">
                        {s.location ? <span>📍 {s.location}</span> : <span>📍 Anywhere</span>}
                        {s.max_price != null ? <span> • Max ${s.max_price}</span> : null}
                        {s.created_at ? <span> • Created {new Date(s.created_at).toLocaleDateString()}</span> : null}
                      </div>

                      {sum ? (
                        <div className="metaPills">
                          <span className="pill neutral">Pending {sum.pending}</span>
                          <span className="pill ok">Sent {sum.sent}</span>
                          <span className="pill neutral">Dismissed {sum.dismissed}</span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>

            {deleted.length ? (
              <div style={{ marginTop: 18 }}>
                <h2 style={{ margin: "16px 0 8px" }}>Deleted</h2>
                <div className="grid">
                  {deleted.map((s) => (
                    <div key={s.id} className="rowCard" style={{ opacity: 0.7 }}>
                      <div className="rowTop">
                        <div className="rowTitle">
                          <span className="pill neutral">#{s.id}</span>
                          <span style={{ fontWeight: 850 }}>{s.search_item}</span>
                          <span className={pillClass(s.status)}>{(s.status || "—").toUpperCase()}</span>
                        </div>
                        <div className="rowBtns">
                          <a className="btn" href="/deleted">
                            Manage
                          </a>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}
