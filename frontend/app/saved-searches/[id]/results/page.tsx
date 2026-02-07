"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "../../../../lib/api";

type ResultRow = {
  id?: string | number;
  search_id?: string | number;
  marketplace?: string | null;
  external_id?: string | null;

  title?: string | null;
  price?: string | number | null;
  currency?: string | null;

  listing_url?: string | null;
  image_url?: string | null;

  location?: string | null;
  condition?: string | null;
  seller_username?: string | null;

  found_at?: string | null;
  created_at?: string | null;
};

function fmtPrice(price: any, currency?: string | null) {
  if (price === null || price === undefined || price === "") return "—";
  const n = Number(price);
  if (Number.isFinite(n)) {
    try {
      // If currency is valid, Intl will format nicely
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

function pillClass(kind: "ok" | "warn" | "bad" | "neutral" = "neutral") {
  // Reuse your existing vibe (soft pills). Falls back gracefully if CSS is minimal.
  return `pill pill-${kind}`;
}

export default function ResultsPage({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const count = rows?.length ?? 0;

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const data = await api.getResults(id, 200, 0);
        if (!alive) return;
        setRows(Array.isArray(data) ? data : []);
        setErr(null);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message || "Failed to load results");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  const sorted = useMemo(() => {
    const copy = [...(rows || [])];
    // prefer found_at desc, fallback created_at
    copy.sort((a, b) => {
      const ta = Date.parse((a.found_at || a.created_at || "") as any) || 0;
      const tb = Date.parse((b.found_at || b.created_at || "") as any) || 0;
      return tb - ta;
    });
    return copy;
  }, [rows]);

  return (
    <main className="page">
      <div className="pageHead">
        <div>
          <h1 className="h1">Results for #{id}</h1>
          <p className="muted">
            Latest stored results from the backend{" "}
            {loading ? "" : `• ${count} item${count === 1 ? "" : "s"}`}
          </p>
        </div>
        <div className="ctaRow">
          <a className="btn" href={`/saved-searches/${id}`}>Details</a>
          <a className="btn" href={`/saved-searches/${id}/alerts`}>Alerts</a>
          <a className="btn" href="/saved-searches">Back</a>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div className="empty">Loading…</div>
        ) : err ? (
          <div className="empty">Error: {err}</div>
        ) : sorted.length === 0 ? (
          <div className="empty">No results yet.</div>
        ) : (
          <div className="resultsGrid">
            {sorted.map((r, idx) => {
              const key = (r.id ?? r.external_id ?? idx) as any;
              const mp = (r.marketplace || "").toLowerCase();
              const mpLabel = r.marketplace ? r.marketplace.toUpperCase() : "SOURCE";
              const priceLabel = fmtPrice(r.price, r.currency);
              const when = fmtWhen(r.found_at || r.created_at);
              const hasImg = !!r.image_url;

              return (
                <div className="resultCard" key={key}>
                  <div className="resultMedia">
                    {hasImg ? (
                      // using <img> to keep it simple; Next Image can be added later
                      <img
                        src={r.image_url as string}
                        alt={r.title || "Result image"}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="resultMediaFallback">
                        <span>no image</span>
                      </div>
                    )}
                  </div>

                  <div className="resultBody">
                    <div className="resultTop">
                      <span className={pillClass(mp === "ebay" ? "ok" : "neutral")}>
                        {mpLabel}
                      </span>
                      {r.condition ? (
                        <span className={pillClass("neutral")}>{r.condition}</span>
                      ) : null}
                      {r.location ? (
                        <span className={pillClass("neutral")}>{r.location}</span>
                      ) : null}
                    </div>

                    <div className="resultTitle" title={r.title || ""}>
                      {r.title || "—"}
                    </div>

                    <div className="resultMeta">
                      <div className="resultPrice">{priceLabel}</div>
                      <div className="resultSub">
                        {r.seller_username ? <span>Seller: {r.seller_username}</span> : <span />}
                        {when ? <span className="muted">Found: {when}</span> : null}
                      </div>
                    </div>

                    <div className="resultActions">
                      {r.listing_url ? (
                        <a className="btn btnSmall" href={r.listing_url} target="_blank" rel="noreferrer">
                          Open
                        </a>
                      ) : (
                        <span className="muted">No link</span>
                      )}

                      {r.listing_url ? (
                        <button
                          className="btn btnSmall btnGhost"
                          type="button"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(r.listing_url as string);
                            } catch { }
                          }}
                          title="Copy listing link"
                        >
                          Copy link
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Minimal CSS (scoped globally by class names you can keep). */}
      <style jsx global>{`
        .resultsGrid{
          display:grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 14px;
        }
        .resultCard{
          display:grid;
          grid-template-columns: 120px 1fr;
          gap: 12px;
          padding: 12px;
          border: 1px solid rgba(0,0,0,.08);
          border-radius: 14px;
          background: rgba(255,255,255,.65);
          box-shadow: 0 8px 20px rgba(0,0,0,.06);
        }
        .resultMedia{
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
        .resultMedia img{
          width:100%;
          height:100%;
          object-fit: cover;
          display:block;
        }
        .resultMediaFallback{
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
        .resultBody{
          min-width: 0;
          display:flex;
          flex-direction: column;
          gap: 8px;
        }
        .resultTop{
          display:flex;
          flex-wrap: wrap;
          gap: 6px;
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
        .pill-warn{ background: rgba(255, 220, 168, .65); }
        .pill-bad{ background: rgba(255, 186, 186, .65); }
        .pill-neutral{ background: rgba(255,255,255,.75); }
        .resultTitle{
          font-weight: 800;
          line-height: 1.25;
          font-size: 15px;
          overflow: hidden;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
        }
        .resultMeta{
          display:flex;
          align-items:flex-end;
          justify-content: space-between;
          gap: 12px;
        }
        .resultPrice{
          font-weight: 900;
          font-size: 16px;
        }
        .resultSub{
          display:flex;
          flex-direction: column;
          gap: 2px;
          text-align: right;
          font-size: 12px;
        }
        .resultActions{
          display:flex;
          gap: 8px;
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
