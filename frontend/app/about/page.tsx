export default function About() {
  return (
    <div className="section">
      <h1>About GoSnaggit</h1>
      <p className="muted" style={{ maxWidth: 820 }}>
        GoSnaggit helps collectors and shoppers find hard-to-find items by continuously searching supported marketplaces
        and sending alerts when matches appear.
      </p>

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", marginTop: 16 }}>
        <section className="card" style={{ padding: 18 }}>
          <h2>Why it exists</h2>
          <p>
            Finding rare, vintage, or one-of-a-kind items often means checking the same sites over and over—classifieds,
            auctions, niche forums, and marketplaces. That’s time-consuming, and the best listings disappear fast.
          </p>
          <p>
            GoSnaggit was built to do the repetitive part for you: keep searching in the background, then notify you when
            something that matches your hunt shows up.
          </p>
          <p className="muted" style={{ marginTop: 10 }}>
            Examples: antique furniture, vintage audio & hi-fi, classic cars & parts, collectibles & oddities.
          </p>
        </section>

        <section className="card" style={{ padding: 18 }}>
          <h2>How it works</h2>
          <ul style={{ paddingLeft: 18 }}>
            <li>Create a saved search (what you want, optional location, optional price cap).</li>
            <li>GoSnaggit checks supported sources for new matches.</li>
            <li>When something matches, you get an email alert.</li>
            <li>You can control alerts per search: on/off, mode, and max per email.</li>
          </ul>
          <p className="muted" style={{ marginTop: 10 }}>
            GoSnaggit is currently in early access. Supported sources may expand over time as partnerships and approvals
            are completed.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
            <a className="btn primary" href="/new-search">Search a Product</a>
            <a className="btn" href="/saved-searches">View My Searches</a>
          </div>
        </section>
      </div>

      <section className="card" style={{ padding: 18, marginTop: 16 }}>
        <h2>What GoSnaggit is not</h2>
        <p className="muted">
          GoSnaggit is designed to help you track your own searches and receive alerts. It is not intended for bulk data
          harvesting, reselling marketplace data, or bypassing platform rules. We aim to work within marketplace policies
          and, where required, through official APIs and approvals.
        </p>
      </section>
    </div>
  );
}
