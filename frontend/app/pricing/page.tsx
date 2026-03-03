export default function Pricing() {
    const tiers = [
        {
            name: "Free",
            price: "$0",
            subtitle: "For casual hunting",
            highlights: [
                "Up to 5 saved searches",
                "Refresh cadence: daily",
                "Email alerts (per search settings)",
            ],
            cta: { label: "Get started", href: "/register" },
        },
        {
            name: "Pro",
            price: "$9/mo",
            subtitle: "For serious collectors",
            highlights: [
                "Up to 25 saved searches",
                "Refresh cadence: hourly",
                "Email alerts (per search settings)",
            ],
            cta: { label: "Join waitlist", href: "/register" },
        },
        {
            name: "Power",
            price: "$19/mo",
            subtitle: "For power hunters",
            highlights: [
                "Up to 100 saved searches",
                "Refresh cadence: every 15 minutes",
                "Email alerts (per search settings)",
            ],
            cta: { label: "Join waitlist", href: "/register" },
        },
    ];

    return (
        <div className="section">
            <h1>Pricing</h1>
            <p className="muted" style={{ maxWidth: 760 }}>
                GoSnaggit tiers control how many saved searches you can run and how often we refresh them. Payments can come later
                when we launch beta — this page is the comparison baseline.
            </p>

            <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", marginTop: 18 }}>
                {tiers.map((t) => (
                    <div key={t.name} className="card" style={{ padding: 18 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
                            <h2 style={{ margin: 0 }}>{t.name}</h2>
                            <div style={{ fontWeight: 700 }}>{t.price}</div>
                        </div>
                        <p className="muted" style={{ marginTop: 6 }}>{t.subtitle}</p>

                        <ul style={{ marginTop: 12, paddingLeft: 18 }}>
                            {t.highlights.map((h) => <li key={h}>{h}</li>)}
                        </ul>

                        <div style={{ marginTop: 14 }}>
                            <a className="btn primary" href={t.cta.href}>{t.cta.label}</a>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
