import Link from "next/link";
import { getListingsForSearch, getSearchById } from "@gosnaggit/core";

type PageProps = {
    params: Promise<{
        id: string;
    }>;
};

function formatMoney(
    price: string | null | undefined,
    currency: string | null | undefined
) {
    if (!price) return "—";
    return currency ? `${price} ${currency}` : price;
}

function buildDisplayUrl(url: string | null | undefined) {
    return url ?? "#";
}

export default async function SearchDetailPage({ params }: PageProps) {
    const { id } = await params;
    const searchId = Number(id);

    if (!Number.isFinite(searchId)) {
        return (
            <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
                <main className="mx-auto max-w-5xl px-6 py-10">
                    <p>Invalid search id.</p>
                </main>
            </div>
        );
    }

    const search = await getSearchById(searchId);

    if (!search) {
        return (
            <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
                <main className="mx-auto max-w-5xl px-6 py-10">
                    <Link
                        href="/"
                        className="mb-6 inline-flex rounded-full border border-black/10 px-4 py-2 text-sm dark:border-white/10"
                    >
                        Back
                    </Link>
                    <p>Search not found.</p>
                </main>
            </div>
        );
    }

    const rows = await getListingsForSearch(searchId, 100);

    return (
        <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
            <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10">
                <div className="flex flex-col gap-4 rounded-3xl border border-black/10 bg-white p-8 shadow-sm dark:border-white/10 dark:bg-neutral-950">
                    <Link
                        href="/"
                        className="inline-flex w-fit rounded-full border border-black/10 px-4 py-2 text-sm font-medium transition hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
                    >
                        Back to searches
                    </Link>

                    <div>
                        <div className="text-sm uppercase tracking-[0.2em] text-black/50 dark:text-white/50">
                            Search #{search.id}
                        </div>
                        <h1 className="mt-2 text-3xl font-bold">{search.searchItem}</h1>
                        <p className="mt-2 text-sm text-black/60 dark:text-white/60">
                            {rows.length} linked listing{rows.length === 1 ? "" : "s"} from the
                            canonical dedupe model.
                        </p>
                    </div>
                </div>

                {rows.length === 0 ? (
                    <div className="rounded-3xl border border-dashed border-black/15 p-8 text-sm text-black/60 dark:border-white/15 dark:text-white/60">
                        No listings linked to this search yet.
                    </div>
                ) : (
                    <div className="grid gap-4">
                        {rows.map((row) => (
                            <article
                                key={row.searchResultId}
                                className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-neutral-950"
                            >
                                <div className="flex flex-col gap-3">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                            <div className="text-xs uppercase tracking-[0.2em] text-black/45 dark:text-white/45">
                                                {row.marketplace} • listing #{row.listingId}
                                            </div>
                                            <h2 className="mt-1 text-lg font-semibold">
                                                {row.title || "Untitled listing"}
                                            </h2>
                                        </div>
                                        <div className="rounded-full border border-black/10 px-3 py-1 text-sm font-medium dark:border-white/10">
                                            {formatMoney(row.price, row.currency)}
                                        </div>
                                    </div>

                                    <div className="grid gap-2 text-sm text-black/65 dark:text-white/65 md:grid-cols-3">
                                        <div>
                                            <span className="font-medium">Condition:</span>{" "}
                                            {row.condition || "—"}
                                        </div>
                                        <div>
                                            <span className="font-medium">Seller:</span>{" "}
                                            {row.sellerUsername || "—"}
                                        </div>
                                        <div>
                                            <span className="font-medium">Location:</span>{" "}
                                            {row.location || "—"}
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                                        <div className="text-xs text-black/50 dark:text-white/50">
                                            External ID: {row.externalId}
                                        </div>
                                        <a
                                            href={buildDisplayUrl(row.listingUrl)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex rounded-full border border-black/10 px-4 py-2 text-sm font-medium transition hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
                                        >
                                            View on eBay
                                        </a>
                                    </div>
                                </div>
                            </article>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}