// frontend/app/saved-searches/page.tsx

type SearchRow = {
  id: number;
  search_item: string;
  location: string | null;
  category: string | null;
  max_price: number | null;
  status: string | null;
  plan_tier: string | null;
  created_at: string | null;
};

export const dynamic = "force-dynamic";

async function getSearches(): Promise<SearchRow[]> {
  const base = process.env.API_BASE_URL || "http://127.0.0.1:3000";
  const url = `${base}/searches?limit=100`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load searches: ${res.status}`);

  return res.json();
}

export default async function SavedSearchesPage() {
  const searches = await getSearches();

  return (
    <main className="page">
      <h1 className="h1">Saved searches</h1>
      <p className="muted">Live data from backend API.</p>

      <div className="card">
        {searches.length === 0 ? (
          <div className="empty">No searches found yet.</div>
        ) : (
          <div className="tableWrap">
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Item</th>
                  <th>Location</th>
                  <th>Category</th>
                  <th>Max</th>
                  <th>Status</th>
                  <th>Tier</th>
                </tr>
              </thead>
              <tbody>
                {searches.map((s) => (
                  <tr key={s.id}>
                    <td>{s.id}</td>
                    <td>{s.search_item}</td>
                    <td>{s.location ?? "—"}</td>
                    <td>{s.category ?? "—"}</td>
                    <td>{s.max_price ?? "—"}</td>
                    <td>{s.status ?? "—"}</td>
                    <td>{s.plan_tier ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
