"use client";

import { useState } from "react";
import { api } from "../../lib/api";
import { useRouter } from "next/navigation";

export default function NewSearch() {
  const router = useRouter();
  const [search_item, setItem] = useState("");
  const [location, setLocation] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    if (!search_item.trim()) {
      alert("Please enter a search item.");
      return;
    }
    try {
      setBusy(true);
      const max_price = maxPrice.trim() ? Number(maxPrice) : null;
      const res = await api.createSearch({
        search_item: search_item.trim(),
        location: location.trim() || null,
        max_price: Number.isFinite(max_price as any) ? max_price : null,
      });
      const id = res?.search?.id;
      router.push(id ? `/saved-searches/${id}` : "/saved-searches");
    } catch (e: any) {
      alert(e?.message || "Failed to create search");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <h1 className="h1">New search</h1>
      <p className="muted">Create a new saved search in the backend.</p>

      <div className="panel">
        <label>Search item</label>
        <input value={search_item} onChange={(e) => setItem(e.target.value)} placeholder="e.g., vintage car radio Blaupunkt" />

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

        <div className="ctaRow" style={{marginTop: 14}}>
          <button className="btn primary" onClick={onSubmit} disabled={busy}>
            {busy ? "Starting…" : "Start search"}
          </button>
          <a className="btn" href="/saved-searches">Cancel</a>
        </div>
      </div>
    </main>
  );
}
