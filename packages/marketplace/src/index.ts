type EbayBrowseItemSummary = {
    itemId?: string;
    title?: string;
    itemWebUrl?: string;
    image?: {
        imageUrl?: string;
    };
    price?: {
        value?: string;
        currency?: string;
    };
    shippingOptions?: Array<{
        shippingCost?: {
            value?: string;
            currency?: string;
        };
    }>;
    itemLocation?: {
        city?: string;
        stateOrProvince?: string;
        country?: string;
    };
    condition?: string;
    seller?: {
        username?: string;
    };
};

type EbayBrowseSearchResponse = {
    itemSummaries?: EbayBrowseItemSummary[];
};

export type SearchMarketplaceParams = {
    marketplace: "ebay";
    searchId: number;
    searchItem: string;
    location?: string | null;
    category?: string | null;
    maxPrice?: number | null;
};

export type MarketplaceListing = {
    marketplace: "ebay";
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

function buildMockListing(
    searchId: number,
    searchItem: string,
    maxPrice?: number | null
): MarketplaceListing {
    return {
        marketplace: "ebay",
        externalId: `mock-ebay-${searchId}`,
        title: `Mock result for "${searchItem}"`,
        price: maxPrice ?? 100,
        currency: "USD",
        url: `https://example.com/mock-ebay-${searchId}`,
        imageUrl: null,
        location: null,
        sellerName: "Mock Seller",
        listedAt: new Date(),
        condition: "Used",
        shippingPrice: 15,
    };
}

function getEnv(name: string): string | undefined {
    const value = process.env[name];
    return value && value.trim() !== "" ? value.trim() : undefined;
}

function hasEbayCredentials(): boolean {
    return Boolean(
        getEnv("EBAY_BROWSE_API_BASE_URL") &&
        getEnv("EBAY_OAUTH_TOKEN")
    );
}

function formatLocation(item: EbayBrowseItemSummary): string | null {
    const parts = [
        item.itemLocation?.city,
        item.itemLocation?.stateOrProvince,
        item.itemLocation?.country,
    ].filter(Boolean);

    return parts.length > 0 ? parts.join(", ") : null;
}

function parseNumber(value?: string): number | null {
    if (!value) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function normalizeEbayItem(item: EbayBrowseItemSummary): MarketplaceListing | null {
    const externalId = item.itemId?.trim();
    const title = item.title?.trim();
    const url = item.itemWebUrl?.trim();

    if (!externalId || !title || !url) {
        return null;
    }

    const shippingPrice = parseNumber(
        item.shippingOptions?.[0]?.shippingCost?.value
    );

    return {
        marketplace: "ebay",
        externalId,
        title,
        price: parseNumber(item.price?.value),
        currency: item.price?.currency ?? null,
        url,
        imageUrl: item.image?.imageUrl ?? null,
        location: formatLocation(item),
        sellerName: item.seller?.username ?? null,
        listedAt: new Date(),
        condition: item.condition ?? null,
        shippingPrice,
    };
}

async function searchEbay(
    params: SearchMarketplaceParams
): Promise<MarketplaceListing[]> {
    const baseUrl = getEnv("EBAY_BROWSE_API_BASE_URL");
    const token = getEnv("EBAY_OAUTH_TOKEN");

    if (!baseUrl || !token) {
        return [buildMockListing(params.searchId, params.searchItem, params.maxPrice)];
    }

    const url = new URL("/buy/browse/v1/item_summary/search", baseUrl);

    url.searchParams.set("q", params.searchItem);
    url.searchParams.set("limit", "10");

    if (typeof params.maxPrice === "number") {
        url.searchParams.set("filter", `price:[..${params.maxPrice}]`);
    }

    const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
            "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
        },
    });

    if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(
            `eBay Browse API search failed: ${response.status} ${response.statusText}${text ? ` | ${text}` : ""}`
        );
    }

    const data = (await response.json()) as EbayBrowseSearchResponse;
    const items = data.itemSummaries ?? [];

    const normalized = items
        .map(normalizeEbayItem)
        .filter((item): item is MarketplaceListing => item !== null);

    return normalized;
}

export async function searchMarketplace(
    params: SearchMarketplaceParams
): Promise<MarketplaceListing[]> {
    if (params.marketplace !== "ebay") {
        return [];
    }

    if (!hasEbayCredentials()) {
        return [buildMockListing(params.searchId, params.searchItem, params.maxPrice)];
    }

    return searchEbay(params);
}