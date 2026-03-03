// worker/lib/http.js
async function httpJson(url, options = {}) {
    const res = await fetch(url, {
        ...options,
        headers: {
            'content-type': 'application/json',
            ...(options.headers || {}),
        },
    });

    const text = await res.text();
    let data = null;

    try {
        data = text ? JSON.parse(text) : null;
    } catch {
        data = { raw: text };
    }

    return { ok: res.ok, status: res.status, data };
}

module.exports = { httpJson };
