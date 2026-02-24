"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, type SearchRow, type ResultRow } from "../../../../lib/api";



function numPrice(r: any) {
  // Prefer indexed numeric column
  const n1 = Number(r?.price_num);
  if (Number.isFinite(n1) && n1 > 0) return n1;

  // Fallback legacy
  const n2 = Number(r?.price);
  if (Number.isFinite(n2) && n2 > 0) return n2;

  return null;
}

function isRecent(iso?: string | null, hours = 48) {
  if (!iso) return false;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  const age = Date.now() - t;
  return age >= 0 && age <= hours * 60 * 60 * 1000;
}

function resultKey(r: ResultRow): string {
  return String(r.id ?? r.external_id ?? r.listing_url ?? `${r.marketplace ?? "m"}:${r.title ?? "t"}`);
}

function fmtPrice(price: any, currency?: string | null) {
  const n = Number(price);
  if (!Number.isFinite(n) || n <= 0) return "—";
  const cur = (currency || "USD").toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: cur }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

function fmtWhen(iso?: string | null) {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const d = new Date(t);
  return d.toLocaleString();
}

function pillClass(kind: "ok" | "warn" | "bad" | "neutral" = "neutral") {
  return `pill ${kind}`;
}

export default function ResultsPage({ params }: { params: { id: string } }) {
  const id = Number(params.id);

  const [rows, setRows] = useState<ResultRow[]>([]);
  const [search, setSearch] = useState<SearchRow | null>(null);
  const [sortBy, setSortBy] = useState<"newest" | "price_low" | "price_high">("newest");

  const searchParams = useSearchParams();
  const focusNew = (searchParams.get("focus") || "").toLowerCase() === "new";

  const storageKey = `gosnaggit:hiddenResults:${id}`;
  const [hiddenKeys, setHiddenKeys] = useState<string[]>([]);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const count = rows?.length ?? 0;

  useEffect(() => {
    // Load per-search hidden (dismissed) results
    try {
      const raw = localStorage.getItem(storageKey);
      const arr = raw ? (JSON.parse(raw) as string[]) : [];
      if (Array.isArray(arr)) setHiddenKeys(arr.map(String));
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    // Persist hidden keys
    try {
      localStorage.setItem(storageKey, JSON.stringify(hiddenKeys));
    } catch {
      // ignore
    }
  }, [storageKey, hiddenKeys]);

  function hideResult(k: string) {
    setHiddenKeys((prev) => (prev.includes(k) ? prev : [...prev, k]));
  }

  function undoHide() {
    setHiddenKeys([]);
  }

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr(null);

    (async () => {
      try {
        const [s, r] = await Promise.all([api.getSearch(id), api.getResults(id, 200, 0)]);
        if (!alive) return;
        setSearch(s || null);
        setRows(r);
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
  }, [id]);

  const sorted = useMemo(() => {
    const copy = [...rows];

    const isNewRow = (r: ResultRow) => isRecent(r.found_at || r.created_at, 48);

    const cmpNewFirst = (a: ResultRow, b: ResultRow) => {
      const na = isNewRow(a) ? 1 : 0;
      const nb = isNewRow(b) ? 1 : 0;
      return nb - na;
    };

    const cmpNewest = (a: ResultRow, b: ResultRow) => {
      const ta = new Date(a.found_at || a.created_at || 0).getTime();
      const tb = new Date(b.found_at || b.created_at || 0).getTime();
      return tb - ta;
    };

    if (sortBy === "price_low") {
      return copy.sort((a, b) => {
        const p = cmpNewFirst(a, b);
        if (p !== 0) return p;
        return (numPrice(a) ?? Infinity) - (numPrice(b) ?? Infinity);
      });
    }

    if (sortBy === "price_high") {
      return copy.sort((a, b) => {
        const p = cmpNewFirst(a, b);
        if (p !== 0) return p;
        return (numPrice(b) ?? -Infinity) - (numPrice(a) ?? -Infinity);
      });
    }

    // Default: NEW first, then newest
    return copy.sort((a, b) => {
      const p = cmpNewFirst(a, b);
      if (p !== 0) return p;
      return cmpNewest(a, b);
    });
  }, [rows, sortBy]);

  const priceStats = useMemo(() => {
    const nums = (sorted || [])
      .map((r) => numPrice(r))
      .filter((n): n is number => n !== null)
      .sort((a, b) => a - b);

    if (nums.length === 0) return null;

    const min = nums[0];
    const max = nums[nums.length - 1];
    const mid = Math.floor(nums.length / 2);
    const median = nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;

    const maxPrice = search?.max_price ?? null;
    const underMax = maxPrice == null ? null : nums.filter((n) => n <= maxPrice).length;

    return { min, median, max, count: nums.length, maxPrice, underMax };
  }, [sorted, search]);

  return (
    <main className="page">
      <div className="pageHead">
        <div>
          <h1 className="h1">Results for #{id}</h1>
          <p className="muted">
            Latest stored results from the backend {loading ? "" : `• ${count} item${count === 1 ? "" : "s"}`}
            {focusNew ? " • showing NEW first" : ""}
          </p>
        </div>

        <div className="ctaRow">
          <a className="btn" href={`/saved-searches/${id}`}>
            Details
          </a>
          <a className="btn" href={`/saved-searches/${id}/alerts`}>
            Alerts
          </a>
        </div>
      </div>

      {hiddenKeys.length ? (
        <div className="flash warn" style={{ marginBottom: 12 }}>
          You hid {hiddenKeys.length} result{hiddenKeys.length === 1 ? "" : "s"}.
          <button className="btn" style={{ marginLeft: 10 }} type="button" onClick={undoHide}>
            Undo
          </button>
        </div>
      ) : null}

      {priceStats ? (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="resultMeta" style={{ marginBottom: 6 }}>
            <div>
              <strong>Price stats:</strong> min {fmtPrice(priceStats.min)} • median {fmtPrice(priceStats.median)} • max{" "}
              {fmtPrice(priceStats.max)}
            </div>
            <div className="muted">
              {priceStats.maxPrice != null ? `Under max (${priceStats.maxPrice}): ${priceStats.underMax}` : ""}
            </div>
          </div>

          <div className="ctaRow">
            <button className={`btn ${sortBy === "newest" ? "primary" : ""}`} onClick={() => setSortBy("newest")}>
              Newest
            </button>
            <button
              className={`btn ${sortBy === "price_low" ? "primary" : ""}`}
              onClick={() => setSortBy("price_low")}
            >
              Price ↑
            </button>
            <button
              className={`btn ${sortBy === "price_high" ? "primary" : ""}`}
              onClick={() => setSortBy("price_high")}
            >
              Price ↓
            </button>
          </div>
        </div>
      ) : null}

      {err ? <div className="flash bad">{err}</div> : null}

      {loading ? (
        <div className="card">Loading…</div>
      ) : count === 0 ? (
        <div className="card empty">
          <div style={{ fontWeight: 800, marginBottom: 6 }}>No results yet</div>
          <div className="muted" style={{ marginBottom: 12 }}>
            Once your search runs, results will appear here. You can also trigger a refresh from Alerts.
          </div>
          <div className="ctaRow">
            <a className="btn primary" href={`/saved-searches/${id}/alerts`}>
              Go to Alerts
            </a>
            <a className="btn" href={`/saved-searches/${id}`}>
              Back to Details
            </a>
          </div>
        </div>
      ) : (

        <>
          <div className="resultsGrid">
            {sorted.map((r, idx) => {
              const key = resultKey(r);
              if (hiddenKeys.includes(key)) return null;
              const isNew = isRecent(r.found_at || r.created_at, 48);

              const mp = (r.marketplace || "").toLowerCase();
              const mpLabel = r.marketplace ? r.marketplace.toUpperCase() : "SOURCE";
              const priceLabel = fmtPrice(r.price_num ?? r.price, r.currency);
              const p = numPrice(r);

              const isBest = priceStats && p != null && p === priceStats.min;
              const underMax =
                priceStats && p != null && priceStats.maxPrice != null && p <= priceStats.maxPrice;

              const when = fmtWhen(r.found_at || r.created_at);
              const hasImg = !!r.image_url;

              return (
                <div className={`resultCard ${isNew ? "newCard" : ""}`} key={key}>
                  <div className="resultMedia">
                    {hasImg ? (
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
                      <span className={pillClass(mp === "ebay" ? "ok" : "neutral")}>{mpLabel}</span>
                      {isNew ? (
                        <span className="pill bad pillNew" title="New result">
                          NEW
                        </span>
                      ) : null}
                      {isBest ? <span className={`${pillClass("ok")} pillBest`}>🏷️ BEST PRICE</span> : null}
                      {underMax ? <span className={`${pillClass("warn")} pillUnder`}>UNDER MAX</span> : null}
                      {r.condition ? <span className={pillClass("neutral")}>{r.condition}</span> : null}
                      {r.location ? <span className={pillClass("neutral")}>{r.location}</span> : null}
                    </div>

                    <div className="resultTitle">{r.title || "Untitled listing"}</div>

                    <div className="resultMeta">
                      <div className="resultPrice">{priceLabel}</div>
                      <div className="muted">{when}</div>
                    </div>

                    <div className="resultActions">
                      {r.listing_url ? (
                        <a className="btn primary" href={r.listing_url as string} target="_blank" rel="noreferrer">
                          Open listing
                        </a>
                      ) : null}
                      <button className="btn danger" type="button" onClick={() => hideResult(key)}>
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <style jsx>{`
        .page {
          padding: 18px;
        }
        .pageHead {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 12px;
        }
        .h1 {
          margin: 0;
          font-size: 22px;
          font-weight: 900;
        }
        .muted {
          opacity: 0.72;
          margin: 6px 0 0;
        }
        .ctaRow {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .card {
          padding: 14px;
          border-radius: var(--radius);
          border: 1px solid var(--panel-border);
          background: var(--panel);
          box-shadow: 0 10px 22px rgba(0, 0, 0, 0.07);
        }
        .empty {
          padding: 18px;
          opacity: 0.8;
        }
        .resultsGrid {
          display: grid;
          gap: 12px;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        }
        .resultCard {
          border-radius: var(--radius-sm);
          overflow: hidden;
          border: 1px solid rgba(0, 0, 0, 0.1);
          background: rgba(255, 255, 255, 0.55);
          display: grid;
          grid-template-rows: 160px auto;
          transition: transform 140ms ease, box-shadow 140ms ease;
        }
        .resultCard:hover {
          transform: translateY(-2px);
          box-shadow: var(--shadow);
        }

        .newCard {
          border-color: rgba(193, 18, 31, 0.35);
          background: rgba(255, 232, 235, 0.6);
        }

        .pillNew {
          background: rgba(193, 18, 31, 0.22);
          border-color: rgba(193, 18, 31, 0.6);
          color: rgba(255, 255, 255, 0.95);
          letter-spacing: 0.08em;
        }

        .btn.danger {
          border-color: rgba(193, 18, 31, 0.45);
          background: rgba(193, 18, 31, 0.12);
        }

        .btn.danger:hover {
          background: rgba(193, 18, 31, 0.18);
        }

        .pillBest {
          letter-spacing: 0.06em;
        }

        .pillUnder {
          letter-spacing: 0.04em;
        }
        .resultMedia {
          background: rgba(255, 255, 255, 0.04);
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }
        .resultMedia img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .resultMediaFallback {
          opacity: 0.7;
          font-size: 12px;
        }
        .resultBody {
          padding: 12px;
          display: grid;
          gap: 8px;
        }
        .resultTop {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          align-items: center;
        }
        .resultTitle {
          font-weight: 800;
          line-height: 1.2;
        }
        .resultMeta {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          align-items: baseline;
        }
        .resultPrice {
          font-weight: 900;
        }
        .resultActions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
      `}</style>
    </main>
  );
}
