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

type EbayTokenResponse = {
    access_token: string;
    expires_in: number;
    token_type: string;
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

type CachedToken = {
    accessToken: string;
    expiresAtMs: number;
};

let cachedEbayToken: CachedToken | null = null;

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
        getEnv("EBAY_CLIENT_ID") &&
        getEnv("EBAY_CLIENT_SECRET")
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

function toBasicAuthHeader(clientId: string, clientSecret: string): string {
    const raw = `${clientId}:${clientSecret}`;
    const encoded = Buffer.from(raw, "utf8").toString("base64");
    return `Basic ${encoded}`;
}

async function fetchNewEbayAccessToken(): Promise<CachedToken> {
    const clientId = getEnv("EBAY_CLIENT_ID");
    const clientSecret = getEnv("EBAY_CLIENT_SECRET");
    const baseUrl = getEnv("EBAY_BROWSE_API_BASE_URL");

    if (!clientId || !clientSecret || !baseUrl) {
        throw new Error(
            "Missing eBay credentials. Expected EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, and EBAY_BROWSE_API_BASE_URL."
        );
    }

    const identityBase =
        baseUrl.includes("sandbox")
            ? "https://api.sandbox.ebay.com"
            : "https://api.ebay.com";

    const tokenUrl = `${identityBase}/identity/v1/oauth2/token`;

    const response = await fetch(tokenUrl, {
        method: "POST",
        headers: {
            Authorization: toBasicAuthHeader(clientId, clientSecret),
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope",
    });

    if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(
            `eBay token request failed: ${response.status} ${response.statusText}${text ? ` | ${text}` : ""}`
        );
    }

    const data = (await response.json()) as EbayTokenResponse;

    if (!data.access_token || !data.expires_in) {
        throw new Error("eBay token response was missing access_token or expires_in.");
    }

    const refreshBufferMs = 5 * 60 * 1000;
    const expiresAtMs = Date.now() + data.expires_in * 1000 - refreshBufferMs;

    return {
        accessToken: data.access_token,
        expiresAtMs,
    };
}

async function getEbayAccessToken(): Promise<string> {
    if (cachedEbayToken && Date.now() < cachedEbayToken.expiresAtMs) {
        return cachedEbayToken.accessToken;
    }

    cachedEbayToken = await fetchNewEbayAccessToken();
    return cachedEbayToken.accessToken;
}

async function searchEbay(
    params: SearchMarketplaceParams
): Promise<MarketplaceListing[]> {
    const baseUrl = getEnv("EBAY_BROWSE_API_BASE_URL");

    if (!baseUrl) {
        return [buildMockListing(params.searchId, params.searchItem, params.maxPrice)];
    }

    const token = await getEbayAccessToken();

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

    if (response.status === 401) {
        cachedEbayToken = null;
        const retryToken = await getEbayAccessToken();

        const retryResponse = await fetch(url.toString(), {
            method: "GET",
            headers: {
                Authorization: `Bearer ${retryToken}`,
                Accept: "application/json",
                "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
            },
        });

        if (!retryResponse.ok) {
            const retryText = await retryResponse.text().catch(() => "");
            throw new Error(
                `eBay Browse API search failed after token refresh: ${retryResponse.status} ${retryResponse.statusText}${retryText ? ` | ${retryText}` : ""}`
            );
        }

        const retryData = (await retryResponse.json()) as EbayBrowseSearchResponse;
        const retryItems = retryData.itemSummaries ?? [];

        return retryItems
            .map(normalizeEbayItem)
            .filter((item): item is MarketplaceListing => item !== null);
    }

    if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(
            `eBay Browse API search failed: ${response.status} ${response.statusText}${text ? ` | ${text}` : ""}`
        );
    }

    const data = (await response.json()) as EbayBrowseSearchResponse;
    const items = data.itemSummaries ?? [];

    return items
        .map(normalizeEbayItem)
        .filter((item): item is MarketplaceListing => item !== null);
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