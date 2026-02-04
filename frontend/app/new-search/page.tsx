export default function NewSearch() {
  return (
    <div className="section">
      <h1>New search</h1>
      <p className="muted">This UI will be rebuilt in Next.js. Backend API remains in the /backend server.</p>
      <div className="panel">
        <label>Search item</label>
        <input placeholder="e.g., vintage car radio Blaupunkt" />
        <div className="grid2">
          <div>
            <label>Location (optional)</label>
            <input placeholder="e.g., New York" />
          </div>
          <div>
            <label>Max price (optional)</label>
            <input placeholder="e.g., 500" />
          </div>
        </div>
        <button className="btn primary">Start search</button>
      </div>
    </div>
  );
}
