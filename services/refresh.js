// services/refresh.js
const pool = require("../db");
const { getEbayAppToken } = require("./ebayAuth");
const { insertResults } = require("./resultsStore");


async function refreshSearch(searchId, { job_id } = {}) {
    const check = await pool.query(
        "SELECT id, search_item, status FROM searches WHERE id = $1",
        [searchId]
    );

    if (check.rowCount === 0) {
        throw new Error("Search not found");
    }

    if ((check.rows[0].status || "").toLowerCase() === "deleted") {
        throw new Error("Cannot refresh deleted search");
    }

    const q = (check.rows[0].search_item || "").trim();
    if (!q) {
        throw new Error("Search has no search_item");
    }

    const token = await getEbayAppToken();

    const url = new URL("https://api.ebay.com/buy/browse/v1/item_summary/search");
    url.searchParams.set("q", q);
    url.searchParams.set("limit", "50");

    const resp = await fetch(url.toString(), {
        method: "GET",
        headers: {
            Authorization: `Bearer ${token}`,
            "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
        },
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
        throw new Error(`eBay error ${resp.status}`);
    }

    const summaries = Array.isArray(data.itemSummaries)
        ? data.itemSummaries
        : [];

    const normalized = summaries
        .map((it) => {
            const priceVal = it?.price?.value ?? null;
            const currency = it?.price?.currency ?? "USD";

            return {
                external_id: it?.itemId || it?.legacyItemId || it?.itemWebUrl || null,
                title: it?.title || "Untitled",
                price: priceVal,
                currency,
                listing_url: it?.itemWebUrl || null,
                image_url: it?.image?.imageUrl || null,
                location: it?.itemLocation?.city || it?.itemLocation?.country || null,
                condition: it?.condition || null,
                seller_username: it?.seller?.username || null,
                found_at: new Date().toISOString(),
            };
        })
        .filter((r) => r.external_id && r.listing_url);

    await insertResults(pool, searchId, "ebay", normalized);

    return {
        ok: true,
        marketplace: "ebay",
        searchId,
        fetched: summaries.length,
    };
}

module.exports = {
    refreshSearch,
};
