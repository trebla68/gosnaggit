export type CreateSearchInput = {
    searchItem: string;
    location?: string | null;
    category?: string | null;
    maxPrice?: number | null;
    marketplaces?: Record<string, boolean> | null;
};

export type SearchRow = {
    id: number;
    userId: number | null;
    searchItem: string;
    location: string | null;
    category: string | null;
    maxPrice: string | number | null;
    status: string | null;
    planTier: string | null;
    marketplaces: unknown;
    createdAt: Date;
    nextRefreshAt: Date | null;
    lastFoundAt: Date | null;
};