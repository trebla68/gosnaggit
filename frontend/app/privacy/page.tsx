export default function Privacy() {
  return (
    <div className="section">
      <h1>Privacy Policy</h1>
      <p className="muted" style={{ maxWidth: 860 }}>
        This policy explains what GoSnaggit collects, how it is used, and the choices you have. (Early access version.)
      </p>

      <section className="card" style={{ padding: 18, marginTop: 16 }}>
        <h2>Summary</h2>
        <ul style={{ paddingLeft: 18 }}>
          <li>We store your saved searches and alert preferences so the app can notify you.</li>
          <li>We store the email address you choose for alerts (to send notifications you requested).</li>
          <li>We do not sell your personal information.</li>
          <li>We aim to use official APIs and comply with marketplace rules where required.</li>
        </ul>
        <p className="muted" style={{ marginTop: 10 }}>
          Questions? Contact: <span className="mono">support@gosnaggit.com</span> (we can change this later).
        </p>
      </section>

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", marginTop: 16 }}>
        <section className="card" style={{ padding: 18 }}>
          <h2>Information we collect</h2>
          <p className="muted">Information you provide:</p>
          <ul style={{ paddingLeft: 18 }}>
            <li>Saved search details (what you’re looking for, optional location, optional price cap).</li>
            <li>Alert preferences per search (enabled/disabled, mode, max per email).</li>
            <li>An email address for receiving alerts.</li>
          </ul>

          <p className="muted" style={{ marginTop: 10 }}>Information collected automatically:</p>
          <ul style={{ paddingLeft: 18 }}>
            <li>Basic server logs (e.g., request time, page accessed) used for reliability and debugging.</li>
          </ul>
        </section>

        <section className="card" style={{ padding: 18 }}>
          <h2>How we use information</h2>
          <ul style={{ paddingLeft: 18 }}>
            <li>To run searches and show your saved hunts in the app.</li>
            <li>To send alert emails when matches appear, according to your settings.</li>
            <li>To improve reliability, prevent abuse, and troubleshoot errors.</li>
          </ul>

          <p className="muted" style={{ marginTop: 10 }}>What we do not do:</p>
          <ul style={{ paddingLeft: 18 }}>
            <li>We do not sell your personal information.</li>
            <li>We do not send marketing emails unless you explicitly opt in (future feature).</li>
          </ul>
        </section>
      </div>

      <section className="card" style={{ padding: 18, marginTop: 16 }}>
        <h2>Sharing</h2>
        <p className="muted">
          GoSnaggit shares information only as needed to provide the service—for example, sending an email alert through
          an email provider. We do not share or sell your information to third parties for their marketing.
        </p>
      </section>

      <section className="card" style={{ padding: 18, marginTop: 16 }}>
        <h2>Data retention</h2>
        <p className="muted">
          We retain your saved searches and alert preferences while your usage is active. You can delete searches from
          within the app. In early access, additional deletion tools may be limited.
        </p>
      </section>

      <section className="card" style={{ padding: 18, marginTop: 16 }}>
        <h2>Your choices</h2>
        <ul style={{ paddingLeft: 18 }}>
          <li>Disable alerts per search at any time.</li>
          <li>Change the alert email address used for notifications.</li>
          <li>Delete searches you no longer want tracked.</li>
        </ul>
      </section>

      <section className="card" style={{ padding: 18, marginTop: 16 }}>
        <h2>Security</h2>
        <p className="muted">
          We use reasonable safeguards to protect your data. No system is 100% secure, but we work to minimize risk and
          fix issues quickly.
        </p>
      </section>

      <section className="card" style={{ padding: 18, marginTop: 16 }}>
        <h2>Changes to this policy</h2>
        <p className="muted">We may update this policy as GoSnaggit evolves. When we do, we’ll update the date on this page.</p>
        <p className="muted"><strong>Last updated:</strong> February 11, 2026</p>
      </section>
    </div>
  );
}
