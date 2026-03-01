"use client";

import { useMemo, useState } from "react";
import { api } from "../../lib/api";
import { useRouter } from "next/navigation";

type Mk = "ebay" | "etsy" | "facebook" | "craigslist";
type MkMap = Record<Mk, boolean>;

export default function NewSearch() {
  const router = useRouter();

  const [search_item, setItem] = useState("");
  const [location, setLocation] = useState("");
  const [category, setCategory] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [busy, setBusy] = useState(false);

  const [marketplaces, setMarketplaces] = useState<MkMap>({
    ebay: true,
    etsy: false, // coming soon
    facebook: false,
    craigslist: false,
  });

  const anyMarketplaceSelected = useMemo(() => {
    return Object.entries(marketplaces).some(([k, v]) => k !== "etsy" && !!v) || marketplaces.ebay;
  }, [marketplaces]);

  function setMk(key: Mk, next: boolean) {
    setMarketplaces((prev) => ({ ...prev, [key]: next }));
  }

  async function onSubmit() {
    if (!search_item.trim()) {
      alert("Please enter a search item.");
      return;
    }

    try {
      setBusy(true);

      const max_price = maxPrice.trim() ? Number(maxPrice) : null;

      const payload: any = {
        search_item: search_item.trim(),
        location: location.trim() || null,
        category: category.trim() || null,
        max_price: Number.isFinite(max_price as any) ? max_price : null,
        marketplaces: {
          ebay: !!marketplaces.ebay,
          etsy: false, // keep off until enabled
          facebook: !!marketplaces.facebook,
          craigslist: !!marketplaces.craigslist,
        },
      };

      const res = await api.createSearch(payload);
      const id = res?.search?.id;
      router.push(id ? `/saved-searches/${id}/results` : "/saved-searches");
      router.refresh();
    } catch (e: any) {
      alert(e?.message || "Failed to create search");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <h1 className="h1">New search</h1>
      <p className="muted">
        Create a saved search. You can adjust marketplaces and alert settings after you create it.
      </p>

      <div className="card" style={{ padding: 14, marginTop: 12, marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 800 }}>Want beta access + pricing insights?</div>
            <div className="muted">Register so we can notify you as we roll out memberships and payments.</div>
          </div>
          <a className="btn primary" href="/register">Register</a>
        </div>
      </div>


      <div className="panel">
        <label>Search item</label>
        <input
          value={search_item}
          onChange={(e) => setItem(e.target.value)}
          placeholder="e.g., 67051 decorator 2 piece secretary desk"
        />

        <div className="grid2">
          <div>
            <label>Location (optional)</label>
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g., New York" />
          </div>
          <div>
            <label>Max price (optional)</label>
            <input value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} placeholder="e.g., 500" />
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <label>Category (optional)</label>
          <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g., Antiques" />
        </div>

        <details className="panel" style={{ marginTop: 14 }}>
          <summary style={{ cursor: "pointer", fontWeight: 700 }}>Advanced options</summary>

          <div style={{ marginTop: 10 }}>
            <div className="muted" style={{ marginBottom: 6 }}>
              Marketplaces
            </div>

            <div className="grid2">
              <label className="row" style={{ gap: 8 }}>
                <input type="checkbox" checked={marketplaces.ebay} onChange={(e) => setMk("ebay", e.target.checked)} />
                <span>eBay</span>
              </label>

              <label className="row" style={{ gap: 8, opacity: 0.7 }}>
                <input type="checkbox" checked={false} disabled />
                <span>
                  Etsy <span className="pill neutral" style={{ marginLeft: 6 }}>Coming soon</span>
                </span>
              </label>

              <label className="row" style={{ gap: 8 }}>
                <input
                  type="checkbox"
                  checked={marketplaces.facebook}
                  onChange={(e) => setMk("facebook", e.target.checked)}
                />
                <span>Facebook</span>
              </label>

              <label className="row" style={{ gap: 8 }}>
                <input
                  type="checkbox"
                  checked={marketplaces.craigslist}
                  onChange={(e) => setMk("craigslist", e.target.checked)}
                />
                <span>Craigslist</span>
              </label>
            </div>

            {!anyMarketplaceSelected ? (
              <div className="muted" style={{ marginTop: 8 }}>
                Select at least one marketplace.
              </div>
            ) : null}
          </div>
        </details>

        <div className="ctaRow" style={{ marginTop: 14 }}>
          <button className="btn primary" onClick={onSubmit} disabled={busy}>
            {busy ? "Starting…" : "Start search"}
          </button>

          <button className="btn" type="button" onClick={() => router.push("/saved-searches")}>
            View saved searches
          </button>
        </div>
      </div>
    </main>
  );
}
