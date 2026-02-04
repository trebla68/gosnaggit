export default function Home() {
  return (
    <div>
      <section className="hero">
        <div className="heroText">
          <h1>
            On the hunt for <em>hard-to-find</em> items?
          </h1>
          <p>
            Don&apos;t let somebody else beat you to it. GoSnaggit continuously searches classifieds and hidden marketplaces
            and alerts you when your item is found — so you can snag it first.
          </p>
          <div className="ctaRow">
            <a className="btn primary" href="/new-search">Search a Product</a>
            <a className="btn" href="/saved-searches">View My Searches</a>
          </div>
        </div>

        <div className="heroMedia" aria-hidden="true">
          <div className="heroGrid">
            <div className="heroCard big" />
            <div className="heroCard top" />
            <div className="heroCard bottom" />
          </div>
        </div>
      </section>

      <section className="section">
        <h2>What is GoSnaggit?</h2>
        <p className="muted">
          GoSnaggit helps collectors and shoppers find rare, vintage, and hard-to-find items online by automatically searching supported
          marketplaces and sending alerts when matches appear.
        </p>

        <div className="steps">
          <div className="step">
            <div className="pill">Step 01</div>
            <h3>Create Search</h3>
            <p>Tell us what you’re hunting for. Add location, category, and a price cap if you want.</p>
          </div>
          <div className="step">
            <div className="pill">Step 02</div>
            <h3>We hunt it down</h3>
            <p>GoSnaggit keeps scanning supported sources so you don’t have to.</p>
          </div>
          <div className="step">
            <div className="pill">Step 03</div>
            <h3>Get alerts</h3>
            <p>When we find matches, you’ll see them in your dashboard and (soon) via email/push alerts.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
