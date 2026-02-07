"use client";

import { useEffect, useState } from "react";
import { api, type SearchRow } from "../../lib/api";

export default function Deleted() {
  const [rows, setRows] = useState<SearchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const data = await api.listDeleted(200);
        if (!alive) return;
        setRows(data || []);
        setErr(null);
      } catch (e:any) {
        if (!alive) return;
        setErr(e?.message || "Failed to load deleted searches");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <main className="page">
      <h1 className="h1">Deleted searches</h1>
      <p className="muted">Searches you removed from Saved Searches.</p>

      <div className="card">
        {loading ? <div className="empty">Loading…</div> :
         err ? <div className="empty">Error: {err}</div> :
         rows.length === 0 ? <div className="empty">No deleted searches.</div> :
         <div className="list">
           {rows.map(r => (
             <div className="rowCard" key={r.id}>
               <div className="rowTitle">
                 <span className="pill neutral">#{r.id}</span>
                 <span style={{fontWeight:850}}>{r.search_item}</span>
                 <span className="pill bad">DELETED</span>
               </div>
               <div className="rowMeta muted" style={{marginTop: 8}}>
                 {r.location ? <span>📍 {r.location}</span> : <span>📍 —</span>}
                 {r.max_price != null ? <span>💰 {r.max_price}</span> : <span>💰 —</span>}
               </div>
             </div>
           ))}
         </div>
        }
      </div>
    </main>
  );
}
