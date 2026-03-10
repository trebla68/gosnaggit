import Link from "next/link";
import { getRecentSearchesWithCounts } from "@gosnaggit/core";

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

export default async function Home() {
  const searches = await getRecentSearchesWithCounts(25);

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-10 px-6 py-10">
        <section className="rounded-3xl border border-black/10 bg-white p-8 shadow-sm dark:border-white/10 dark:bg-neutral-950">
          <div className="flex flex-col gap-4">
            <span className="inline-flex w-fit rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-red-600 dark:text-red-400">
              GoSnaggit V2
            </span>
            <h1 className="text-4xl font-bold tracking-tight">
              Real searches. Real eBay listings. Clean dedupe.
            </h1>
            <p className="max-w-3xl text-base text-black/70 dark:text-white/70">
              This is the first real V2 dashboard. It is now reading from the
              canonical listings model, so duplicate marketplace items are
              reused across searches instead of being reinserted over and over.
            </p>
          </div>
        </section>

        <section className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-neutral-950">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold">Recent searches</h2>
              <p className="text-sm text-black/60 dark:text-white/60">
                Click any search to view its linked canonical listings.
              </p>
            </div>
            <div className="rounded-full border border-black/10 px-4 py-2 text-sm dark:border-white/10">
              {searches.length} shown
            </div>
          </div>

          {searches.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-black/15 p-8 text-sm text-black/60 dark:border-white/15 dark:text-white/60">
              No searches found yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-y-3">
                <thead>
                  <tr className="text-left text-sm text-black/55 dark:text-white/55">
                    <th className="px-4 py-2 font-medium">ID</th>
                    <th className="px-4 py-2 font-medium">Search</th>
                    <th className="px-4 py-2 font-medium">Results</th>
                    <th className="px-4 py-2 font-medium">Created</th>
                    <th className="px-4 py-2 font-medium">Next refresh</th>
                    <th className="px-4 py-2 font-medium">Open</th>
                  </tr>
                </thead>
                <tbody>
                  {searches.map((search) => (
                    <tr
                      key={search.id}
                      className="rounded-2xl bg-black/[0.03] text-sm dark:bg-white/[0.04]"
                    >
                      <td className="rounded-l-2xl px-4 py-4 align-top font-mono">
                        #{search.id}
                      </td>
                      <td className="px-4 py-4 align-top">
                        <div className="font-semibold">{search.searchItem}</div>
                        <div className="mt-1 text-xs text-black/55 dark:text-white/55">
                          {search.location || "Any location"}
                        </div>
                      </td>
                      <td className="px-4 py-4 align-top">{search.listingCount}</td>
                      <td className="px-4 py-4 align-top text-xs">
                        {formatDate(search.createdAt)}
                      </td>
                      <td className="px-4 py-4 align-top text-xs">
                        {formatDate(search.nextRefreshAt)}
                      </td>
                      <td className="rounded-r-2xl px-4 py-4 align-top">
                        <Link
                          href={`/searches/${search.id}`}
                          className="inline-flex rounded-full border border-black/10 px-4 py-2 text-sm font-medium transition hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
                        >
                          View listings
                        </Link>
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