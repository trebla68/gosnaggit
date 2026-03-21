import {
    normalizeEbayLocation,
    rankListingsByLocation,
    normalizeWhitespace,
    stripPunctuation,
} from "./location";

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
        postalCode?: string;
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

const US_STATE_NAME_TO_CODE: Record<string, string> = {
    alabama: "AL",
    alaska: "AK",
    arizona: "AZ",
    arkansas: "AR",
    california: "CA",
    colorado: "CO",
    connecticut: "CT",
    delaware: "DE",
    florida: "FL",
    georgia: "GA",
    hawaii: "HI",
    idaho: "ID",
    illinois: "IL",
    indiana: "IN",
    iowa: "IA",
    kansas: "KS",
    kentucky: "KY",
    louisiana: "LA",
    maine: "ME",
    maryland: "MD",
    massachusetts: "MA",
    michigan: "MI",
    minnesota: "MN",
    mississippi: "MS",
    missouri: "MO",
    montana: "MT",
    nebraska: "NE",
    nevada: "NV",
    "new hampshire": "NH",
    "new jersey": "NJ",
    "new mexico": "NM",
    "new york": "NY",
    "north carolina": "NC",
    "north dakota": "ND",
    ohio: "OH",
    oklahoma: "OK",
    oregon: "OR",
    pennsylvania: "PA",
    "rhode island": "RI",
    "south carolina": "SC",
    "south dakota": "SD",
    tennessee: "TN",
    texas: "TX",
    utah: "UT",
    vermont: "VT",
    virginia: "VA",
    washington: "WA",
    "west virginia": "WV",
    wisconsin: "WI",
    wyoming: "WY",
    "district of columbia": "DC",
};

const US_STATE_CODE_TO_NAME: Record<string, string> = Object.fromEntries(
    Object.entries(US_STATE_NAME_TO_CODE).map(([name, code]) => [code, name])
);

const COUNTRY_ALIASES: Record<string, string[]> = {
    US: ["us", "usa", "u s a", "united states", "united states of america"],
    CA: ["ca", "canada"],
    GB: ["gb", "uk", "u k", "united kingdom", "great britain", "england"],
    AU: ["au", "australia"],
    DE: ["de", "germany"],
    FR: ["fr", "france"],
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
        getEnv("EBAY_CLIENT_ID") &&
        getEnv("EBAY_CLIENT_SECRET")
    );
}

function parseNumber(value?: string): number | null {
    if (!value) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function logEbayLocationDebug(
    query: string,
    items: EbayBrowseItemSummary[]
) {
    if (getEnv("MARKETPLACE_DEBUG_EBAY_LOCATION") !== "true") {
        return;
    }

    const sample = items.slice(0, 5).map((item) => ({
        itemId: item.itemId ?? null,
        title: item.title ?? null,
        itemLocation: item.itemLocation ?? null,
        formattedLocation: normalizeEbayLocation(item).displayLocation,
        itemWebUrl: item.itemWebUrl ?? null,
    }));

    console.log(
        `[marketplace] eBay raw location debug for query="${query}":`,
        JSON.stringify(sample, null, 2)
    );
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

    const normalizedLocation = normalizeEbayLocation(item);

    return {
        marketplace: "ebay",
        externalId,
        title,
        price: parseNumber(item.price?.value),
        currency: item.price?.currency ?? null,
        url,
        imageUrl: item.image?.imageUrl ?? null,
        location: normalizedLocation.displayLocation,
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

function singularizeSimpleWord(word: string): string {
    const lower = word.toLowerCase();

    if (lower.length <= 3) return word;
    if (lower.endsWith("ies")) return `${word.slice(0, -3)}y`;
    if (lower.endsWith("es")) return word.slice(0, -2);
    if (lower.endsWith("s") && !lower.endsWith("ss")) return word.slice(0, -1);

    return word;
}

function pluralizeSimpleWord(word: string): string {
    const lower = word.toLowerCase();

    if (lower.length <= 2) return word;
    if (lower.endsWith("y") && !/[aeiou]y$/.test(lower)) {
        return `${word.slice(0, -1)}ies`;
    }
    if (
        lower.endsWith("s") ||
        lower.endsWith("x") ||
        lower.endsWith("z") ||
        lower.endsWith("ch") ||
        lower.endsWith("sh")
    ) {
        return `${word}es`;
    }
    return `${word}s`;
}

function replaceLastWord(value: string, replacer: (word: string) => string): string {
    const parts = normalizeWhitespace(value).split(" ");
    if (parts.length === 0) return value;

    const last = parts[parts.length - 1];
    const replaced = replacer(last);

    if (!replaced || replaced === last) {
        return value;
    }

    parts[parts.length - 1] = replaced;
    return parts.join(" ");
}

function buildSearchVariants(searchItem: string): string[] {
    const base = normalizeWhitespace(searchItem);
    if (!base) return [];

    const variants: string[] = [];
    const seen = new Set<string>();

    function addVariant(value: string) {
        const normalized = normalizeWhitespace(value).toLowerCase();
        if (!normalized) return;
        if (seen.has(normalized)) return;
        seen.add(normalized);
        variants.push(normalized);
    }

    addVariant(base);
    addVariant(stripPunctuation(base));

    const singularVariant = replaceLastWord(base, singularizeSimpleWord);
    addVariant(singularVariant);

    const pluralVariant = replaceLastWord(base, pluralizeSimpleWord);
    addVariant(pluralVariant);

    const noApostropheVariant = base.replace(/['’]/g, "");
    addVariant(noApostropheVariant);

    return variants.slice(0, 4);
}

function buildLocationBoostedQueries(
    searchItem: string,
    location?: string | null
): string[] {
    const baseQueries = buildSearchVariants(searchItem);
    const normalizedLocation = normalizeWhitespace(location ?? "");

    if (!normalizedLocation) {
        return baseQueries;
    }

    const boosted: string[] = [];
    const seen = new Set<string>();

    function addQuery(value: string) {
        const normalized = normalizeWhitespace(value).toLowerCase();
        if (!normalized) return;
        if (seen.has(normalized)) return;
        seen.add(normalized);
        boosted.push(normalized);
    }

    for (const query of baseQueries) {
        addQuery(query);
    }

    for (const query of baseQueries.slice(0, 2)) {
        addQuery(`${query} ${normalizedLocation}`);
    }

    return boosted.slice(0, 6);
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

async function runSingleEbaySearch(
    token: string,
    params: SearchMarketplaceParams,
    query: string
): Promise<MarketplaceListing[]> {
    const baseUrl = getEnv("EBAY_BROWSE_API_BASE_URL");

    if (!baseUrl) {
        return [buildMockListing(params.searchId, params.searchItem, params.maxPrice)];
    }

    const url = new URL("/buy/browse/v1/item_summary/search", baseUrl);

    url.searchParams.set("q", query);
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

    logEbayLocationDebug(query, items);

    return items
        .map(normalizeEbayItem)
        .filter((item): item is MarketplaceListing => item !== null);
}

async function searchEbay(
    params: SearchMarketplaceParams
): Promise<MarketplaceListing[]> {
    const baseUrl = getEnv("EBAY_BROWSE_API_BASE_URL");

    if (!baseUrl) {
        return [buildMockListing(params.searchId, params.searchItem, params.maxPrice)];
    }

    const queries = buildLocationBoostedQueries(
        params.searchItem,
        params.location
    );

    const merged = new Map<string, MarketplaceListing>();

    let token = await getEbayAccessToken();

    for (const query of queries) {
        try {
            const items = await runSingleEbaySearch(token, params, query);

            for (const item of items) {
                if (!merged.has(item.externalId)) {
                    merged.set(item.externalId, item);
                }
            }
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);

            if (message.includes("401")) {
                cachedEbayToken = null;
                token = await getEbayAccessToken();

                const retryItems = await runSingleEbaySearch(token, params, query);

                for (const item of retryItems) {
                    if (!merged.has(item.externalId)) {
                        merged.set(item.externalId, item);
                    }
                }

                continue;
            }

            throw error;
        }
    }

    const ranked = rankListingsByLocation(
        Array.from(merged.values()),
        params.location
    );

    return ranked.slice(0, 25);
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