import Link from "next/link";
import { getClickEventSummary, getRecentClickEvents } from "@gosnaggit/core";

function formatDate(value: Date | string | null | undefined) {
    if (!value) return "—";
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString();
}

function truncate(value: string | null | undefined, max = 90) {
    if (!value) return "—";
    return value.length > max ? `${value.slice(0, max)}…` : value;
}

export default async function AdminClicksPage() {
    const [clicks, summary] = await Promise.all([
        getRecentClickEvents(100),
        getClickEventSummary(),
    ]);

    return (
        <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
            <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-6 py-10">
                <section className="rounded-3xl border border-black/10 bg-white p-8 shadow-sm dark:border-white/10 dark:bg-neutral-950">
                    <div className="flex flex-col gap-4">
                        <Link
                            href="/"
                            className="inline-flex w-fit rounded-full border border-black/10 px-4 py-2 text-sm font-medium transition hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
                        >
                            Back to dashboard
                        </Link>

                        <div>
                            <div className="text-sm uppercase tracking-[0.2em] text-black/50 dark:text-white/50">
                                Admin
                            </div>
                            <h1 className="mt-2 text-3xl font-bold">Recent click events</h1>
                            <p className="mt-2 text-sm text-black/60 dark:text-white/60">
                                Latest outbound click activity captured through the canonical redirect
                                route.
                            </p>
                        </div>
                    </div>
                </section>

                <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-neutral-950">
                        <div className="text-sm uppercase tracking-[0.2em] text-black/50 dark:text-white/50">
                            Total clicks
                        </div>
                        <div className="mt-3 text-3xl font-bold">{summary.totalClicks}</div>
                    </div>

                    <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-neutral-950">
                        <div className="text-sm uppercase tracking-[0.2em] text-black/50 dark:text-white/50">
                            Clicks today
                        </div>
                        <div className="mt-3 text-3xl font-bold">{summary.clicksToday}</div>
                    </div>

                    <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-neutral-950">
                        <div className="text-sm uppercase tracking-[0.2em] text-black/50 dark:text-white/50">
                            Last 7 days
                        </div>
                        <div className="mt-3 text-3xl font-bold">{summary.clicksLast7Days}</div>
                    </div>

                    <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-neutral-950">
                        <div className="text-sm uppercase tracking-[0.2em] text-black/50 dark:text-white/50">
                            Top marketplace
                        </div>
                        <div className="mt-3 text-3xl font-bold">
                            {summary.topMarketplace || "—"}
                        </div>
                    </div>
                </section>

                <section className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-neutral-950">
                    <div className="mb-5 flex items-center justify-between gap-4">
                        <div>
                            <h2 className="text-2xl font-semibold">Clicks</h2>
                            <p className="text-sm text-black/60 dark:text-white/60">
                                Showing the 100 most recent click events.
                            </p>
                        </div>
                        <div className="rounded-full border border-black/10 px-4 py-2 text-sm dark:border-white/10">
                            {clicks.length} shown
                        </div>
                    </div>

                    {clicks.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-black/15 p-8 text-sm text-black/60 dark:border-white/15 dark:text-white/60">
                            No click events recorded yet.
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full border-separate border-spacing-y-3">
                                <thead>
                                    <tr className="text-left text-sm text-black/55 dark:text-white/55">
                                        <th className="px-4 py-2 font-medium">Time</th>
                                        <th className="px-4 py-2 font-medium">Click ID</th>
                                        <th className="px-4 py-2 font-medium">Search Result</th>
                                        <th className="px-4 py-2 font-medium">Search</th>
                                        <th className="px-4 py-2 font-medium">Listing</th>
                                        <th className="px-4 py-2 font-medium">Marketplace</th>
                                        <th className="px-4 py-2 font-medium">Destination</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {clicks.map((click) => (
                                        <tr
                                            key={click.id}
                                            className="rounded-2xl bg-black/[0.03] text-sm dark:bg-white/[0.04]"
                                        >
                                            <td className="rounded-l-2xl px-4 py-4 align-top text-xs">
                                                {formatDate(click.createdAt)}
                                            </td>
                                            <td className="px-4 py-4 align-top font-mono">
                                                #{click.id}
                                            </td>
                                            <td className="px-4 py-4 align-top font-mono">
                                                {click.searchResultId ?? "—"}
                                            </td>
                                            <td className="px-4 py-4 align-top font-mono">
                                                {click.searchId ?? "—"}
                                            </td>
                                            <td className="px-4 py-4 align-top font-mono">
                                                {click.listingId ?? "—"}
                                            </td>
                                            <td className="px-4 py-4 align-top">
                                                {click.marketplace || "—"}
                                            </td>
                                            <td className="rounded-r-2xl px-4 py-4 align-top">
                                                {click.destinationUrl ? (
                                                    <a
                                                        href={click.destinationUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-sm underline underline-offset-4"
                                                        title={click.destinationUrl}
                                                    >
                                                        {truncate(click.destinationUrl)}
                                                    </a>
                                                ) : (
                                                    "—"
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            </main>
        </div>
    );
}