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

export type MarketplaceName = "ebay";

export type MarketplaceListing = {
    marketplace: MarketplaceName;
    externalId: string;
    title: string;
    price: number | null;
    currency: string | null;
    url: string;
    imageUrl: string | null;
    location: string | null;
    sellerName: string | null;
    listedAt: Date | null;
    condition: string | null;
    shippingPrice: number | null;
};

export type RefreshSearchSummary = {
    searchId: number;
    marketplacesTried: MarketplaceName[];
    inserted: number;
    skippedDuplicates: number;
};