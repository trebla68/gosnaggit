"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function NewSearchPage() {
    const router = useRouter();

    const [searchItem, setSearchItem] = useState("");
    const [location, setLocation] = useState("");
    const [category, setCategory] = useState("");
    const [maxPrice, setMaxPrice] = useState("");
    const [email, setEmail] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState("");

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError("");
        setIsSubmitting(true);

        try {
            const response = await fetch("/api/searches", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    searchItem,
                    location,
                    category,
                    maxPrice,
                    email,
                }),
            });

            const data = await response.json();

            if (!response.ok || !data?.ok || !data?.search?.id) {
                throw new Error(data?.error || "Failed to create search.");
            }

            router.push(`/searches/${data.search.id}`);
            router.refresh();
        } catch (err) {
            const message =
                err instanceof Error ? err.message : "Failed to create search.";
            setError(message);
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
            <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-10">
                <div className="flex flex-col gap-4 rounded-3xl border border-black/10 bg-white p-8 shadow-sm dark:border-white/10 dark:bg-neutral-950">
                    <Link
                        href="/"
                        className="inline-flex w-fit rounded-full border border-black/10 px-4 py-2 text-sm font-medium transition hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
                    >
                        Back to dashboard
                    </Link>

                    <div>
                        <div className="text-sm uppercase tracking-[0.2em] text-black/50 dark:text-white/50">
                            New search
                        </div>
                        <h1 className="mt-2 text-3xl font-bold">
                            Create a real GoSnaggit alert
                        </h1>
                        <p className="mt-2 text-sm text-black/60 dark:text-white/60">
                            This creates a live search in V2 and stores the alert email
                            destination so the worker can send new listing alerts.
                        </p>
                    </div>
                </div>

                <form
                    onSubmit={handleSubmit}
                    className="rounded-3xl border border-black/10 bg-white p-8 shadow-sm dark:border-white/10 dark:bg-neutral-950"
                >
                    <div className="grid gap-6">
                        <div>
                            <label
                                htmlFor="searchItem"
                                className="mb-2 block text-sm font-medium"
                            >
                                Search item
                            </label>
                            <input
                                id="searchItem"
                                type="text"
                                value={searchItem}
                                onChange={(e) => setSearchItem(e.target.value)}
                                placeholder="vintage rolex"
                                className="w-full rounded-2xl border border-black/10 px-4 py-3 text-sm outline-none transition focus:border-black/30 dark:border-white/10 dark:bg-neutral-900 dark:focus:border-white/30"
                                required
                            />
                        </div>

                        <div className="grid gap-6 md:grid-cols-2">
                            <div>
                                <label
                                    htmlFor="location"
                                    className="mb-2 block text-sm font-medium"
                                >
                                    Location
                                </label>
                                <input
                                    id="location"
                                    type="text"
                                    value={location}
                                    onChange={(e) => setLocation(e.target.value)}
                                    placeholder="Any location"
                                    className="w-full rounded-2xl border border-black/10 px-4 py-3 text-sm outline-none transition focus:border-black/30 dark:border-white/10 dark:bg-neutral-900 dark:focus:border-white/30"
                                />
                            </div>

                            <div>
                                <label
                                    htmlFor="category"
                                    className="mb-2 block text-sm font-medium"
                                >
                                    Category
                                </label>
                                <input
                                    id="category"
                                    type="text"
                                    value={category}
                                    onChange={(e) => setCategory(e.target.value)}
                                    placeholder="Optional"
                                    className="w-full rounded-2xl border border-black/10 px-4 py-3 text-sm outline-none transition focus:border-black/30 dark:border-white/10 dark:bg-neutral-900 dark:focus:border-white/30"
                                />
                            </div>
                        </div>

                        <div className="grid gap-6 md:grid-cols-2">
                            <div>
                                <label
                                    htmlFor="maxPrice"
                                    className="mb-2 block text-sm font-medium"
                                >
                                    Max price
                                </label>
                                <input
                                    id="maxPrice"
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={maxPrice}
                                    onChange={(e) => setMaxPrice(e.target.value)}
                                    placeholder="Optional"
                                    className="w-full rounded-2xl border border-black/10 px-4 py-3 text-sm outline-none transition focus:border-black/30 dark:border-white/10 dark:bg-neutral-900 dark:focus:border-white/30"
                                />
                            </div>

                            <div>
                                <label
                                    htmlFor="email"
                                    className="mb-2 block text-sm font-medium"
                                >
                                    Alert email
                                </label>
                                <input
                                    id="email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="you@example.com"
                                    className="w-full rounded-2xl border border-black/10 px-4 py-3 text-sm outline-none transition focus:border-black/30 dark:border-white/10 dark:bg-neutral-900 dark:focus:border-white/30"
                                    required
                                />
                            </div>
                        </div>

                        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-black/70 dark:text-white/70">
                            Marketplace is currently set to <strong>eBay only</strong> in
                            this V2 flow.
                        </div>

                        {error ? (
                            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
                                {error}
                            </div>
                        ) : null}

                        <div className="flex flex-wrap items-center gap-3">
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="inline-flex rounded-full bg-red-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {isSubmitting ? "Creating..." : "Create search"}
                            </button>

                            <Link
                                href="/"
                                className="inline-flex rounded-full border border-black/10 px-5 py-3 text-sm font-medium transition hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
                            >
                                Cancel
                            </Link>
                        </div>
                    </div>
                </form>
            </main>
        </div>
    );
}
