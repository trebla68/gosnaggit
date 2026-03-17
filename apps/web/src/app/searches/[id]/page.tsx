import Link from "next/link";
import { getListingsForSearch, getSearchById } from "@gosnaggit/core";
import SearchResultsClient from "./SearchResultsClient";

type PageProps = {
    params: Promise<{
        id: string;
    }>;
};

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

                <SearchResultsClient searchId={searchId} initialRows={rows} />
            </main>
        </div>
    );
}