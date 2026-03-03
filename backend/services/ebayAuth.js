// ebayAuth.js
// Gets an eBay OAuth *application* token (client_credentials) for Browse API

const fetch = global.fetch || require("node-fetch");

let cached = { token: null, expiresAt: 0 };

async function getEbayAppToken() {
    const now = Date.now();

    // Reuse token until ~60s before expiry
    if (cached.token && now < cached.expiresAt - 60_000) return cached.token;

    const { EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, EBAY_ENV } = process.env;
    if (!EBAY_CLIENT_ID || !EBAY_CLIENT_SECRET) {
        throw new Error("Missing EBAY_CLIENT_ID or EBAY_CLIENT_SECRET in .env");
    }
    if ((EBAY_ENV || "").toLowerCase() !== "production") {
        throw new Error("EBAY_ENV must be 'production' for this setup");
    }

    const basic = Buffer.from(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`).toString("base64");

    const resp = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
        method: "POST",
        headers: {
            Authorization: `Basic ${basic}`,
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope",
    });

    const data = await resp.json();

    if (!resp.ok) {
        throw new Error(`eBay token error (${resp.status}): ${JSON.stringify(data)}`);
    }

    cached.token = data.access_token;
    cached.expiresAt = Date.now() + (data.expires_in * 1000);

    return cached.token;
}

module.exports = { getEbayAppToken };
