"use client";

import { useEffect, useState } from "react";

type Row = {
    searchResultId: number;
    foundAt: Date | string | null;
    listingId: number;
    marketplace: string | null;
    externalId: string | null;
    title: string | null;
    price: string | null;
    currency: string | null;
    priceNum: string | null;
    shippingNum: string | null;
    totalPrice: string | null;
    listingUrl: string | null;
    imageUrl: string | null;
    location: string | null;
    condition: string | null;
    sellerUsername: string | null;
    firstSeenAt: Date | string | null;
    lastSeenAt: Date | string | null;
};

function formatMoney(
    price: string | null | undefined,
    currency: string | null | undefined
) {
    if (!price) return "-";
    return currency ? `${price} ${currency}` : price;
}

type Props = {
    searchId: number;
    initialRows: Row[];
};

export default function SearchResultsClient({ searchId, initialRows }: Props) {
    const [rows, setRows] = useState<Row[]>(initialRows);
    const [isPolling, setIsPolling] = useState(initialRows.length === 0);
    const [statusText, setStatusText] = useState(
        initialRows.length === 0
            ? "Search created. Waiting for the first marketplace refresh..."
            : ""
    );

    useEffect(() => {
        if (initialRows.length > 0) return;

        let attempts = 0;
        const maxAttempts = 12;

        const interval = setInterval(async () => {
            attempts += 1;

            try {
                const response = await fetch(`/api/searches/${searchId}/results`, {
                    cache: "no-store",
                });

                if (!response.ok) {
                    if (attempts >= maxAttempts) {
                        setIsPolling(false);
                        setStatusText(
                            "Still waiting on the first refresh. This search is active and alerts will send when matches are found."
                        );
                        clearInterval(interval);
                    }
                    return;
                }

                const data = await response.json();
                const nextRows = Array.isArray(data?.rows) ? data.rows : [];

                if (nextRows.length > 0) {
                    setRows(nextRows);
                    setIsPolling(false);
                    setStatusText("");
                    clearInterval(interval);
                    return;
                }

                if (attempts >= maxAttempts) {
                    setIsPolling(false);
                    setStatusText(
                        "No listings are linked yet. The first marketplace refresh may still be running, and alerts will still send when new matches are found."
                    );
                    clearInterval(interval);
                }
            } catch {
                if (attempts >= maxAttempts) {
                    setIsPolling(false);
                    setStatusText(
                        "No listings are linked yet. The first marketplace refresh may still be running, and alerts will still send when new matches are found."
                    );
                    clearInterval(interval);
                }
            }
        }, 5000);

        return () => clearInterval(interval);
    }, [initialRows, searchId]);

    if (rows.length === 0) {
        return (
            <div className="rounded-3xl border border-dashed border-black/15 p-8 text-sm text-black/60 dark:border-white/15 dark:text-white/60">
                <div className="font-medium text-black/75 dark:text-white/75">
                    {isPolling ? "Fetching first results..." : "No listings linked yet"}
                </div>
                <p className="mt-2">
                    {statusText ||
                        "This search is active, and alerts will send when new listings are found."}
                </p>
            </div>
        );
    }

    return (
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
                                {row.condition || "-"}
                            </div>
                            <div>
                                <span className="font-medium">Seller:</span>{" "}
                                {row.sellerUsername || "-"}
                            </div>
                            <div>
                                <span className="font-medium">Location:</span>{" "}
                                {row.location || "-"}
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                            <div className="text-xs text-black/50 dark:text-white/50">
                                External ID: {row.externalId}
                            </div>
                            <a
                                href={`/out/r/${row.searchResultId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex rounded-full border border-black/10 px-4 py-2 text-sm font-medium transition hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
                            >
                                View on {row.marketplace}
                            </a>
                        </div>
                    </div>
                </article>
            ))}
        </div>
    );
}