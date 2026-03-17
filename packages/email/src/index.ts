export type SearchAlertEmailItem = {
    searchResultId: number;
    title: string | null;
    price: string | null;
    marketplace: string | null;
    location: string | null;
    imageUrl: string | null;
};

export type SendSearchAlertEmailInput = {
    to: string;
    searchItem: string;
    items: SearchAlertEmailItem[];
};

function escapeHtml(value: string) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function buildBaseUrl() {
    return (
        process.env.APP_BASE_URL?.trim() ||
        process.env.NEXT_PUBLIC_APP_URL?.trim() ||
        "https://gosnaggit.com"
    ).replace(/\/+$/, "");
}

function buildFromEmail() {
    return (
        process.env.ALERTS_FROM_EMAIL?.trim() ||
        process.env.EMAIL_FROM?.trim() ||
        "alerts@gosnaggit.com"
    );
}

function buildSubject(searchItem: string, count: number) {
    return count === 1
        ? `1 new listing found for "${searchItem}"`
        : `${count} new listings found for "${searchItem}"`;
}

function buildTextBody(searchItem: string, items: SearchAlertEmailItem[]) {
    const baseUrl = buildBaseUrl();

    const lines = [
        `GoSnaggit found ${items.length} new listing${items.length === 1 ? "" : "s"} for "${searchItem}".`,
        "",
    ];

    for (const item of items) {
        const parts = [
            item.title || "Untitled listing",
            item.price || "Price unavailable",
            item.marketplace || "Marketplace unavailable",
            item.location || "Location unavailable",
            `${baseUrl}/out/r/${item.searchResultId}`,
        ];

        lines.push(parts.join(" | "));
        lines.push("");
    }

    lines.push("You are receiving this email because alerts are enabled for this search.");

    return lines.join("\n");
}

function buildHtmlBody(searchItem: string, items: SearchAlertEmailItem[]) {
    const baseUrl = buildBaseUrl();
    const escapedSearchItem = escapeHtml(searchItem);

    const cards = items
        .map((item) => {
            const href = `${baseUrl}/out/r/${item.searchResultId}`;
            const title = escapeHtml(item.title || "Untitled listing");
            const price = escapeHtml(item.price || "Price unavailable");
            const marketplace = escapeHtml(item.marketplace || "Marketplace unavailable");
            const location = escapeHtml(item.location || "Location unavailable");
            const imageHtml = item.imageUrl
                ? `<img src="${escapeHtml(item.imageUrl)}" alt="${title}" style="display:block;width:100%;max-width:180px;height:auto;border-radius:8px;margin-bottom:12px;" />`
                : "";

            return `
                <tr>
                  <td style="padding:0 0 16px 0;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;">
                      <tr>
                        <td style="padding:16px;font-family:Arial,Helvetica,sans-serif;">
                          ${imageHtml}
                          <div style="font-size:18px;font-weight:700;color:#111827;margin-bottom:8px;">${title}</div>
                          <div style="font-size:14px;color:#374151;margin-bottom:6px;"><strong>Price:</strong> ${price}</div>
                          <div style="font-size:14px;color:#374151;margin-bottom:6px;"><strong>Marketplace:</strong> ${marketplace}</div>
                          <div style="font-size:14px;color:#374151;margin-bottom:14px;"><strong>Location:</strong> ${location}</div>
                          <a href="${escapeHtml(href)}" style="display:inline-block;background:#dc2626;color:#ffffff;text-decoration:none;padding:10px 14px;border-radius:8px;font-weight:700;">View Listing</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
            `;
        })
        .join("");

    return `
<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f9fafb;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;margin:0 auto;background:#ffffff;border-radius:12px;">
      <tr>
        <td style="padding:24px;font-family:Arial,Helvetica,sans-serif;">
          <div style="font-size:28px;font-weight:800;color:#111827;margin-bottom:12px;">GoSnaggit</div>
          <div style="font-size:20px;font-weight:700;color:#111827;margin-bottom:10px;">
            ${items.length} new listing${items.length === 1 ? "" : "s"} found for "${escapedSearchItem}"
          </div>
          <div style="font-size:15px;color:#4b5563;margin-bottom:24px;">
            We found new matches for your saved search. Tap any listing below to view it.
          </div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${cards}
          </table>
          <div style="font-size:12px;color:#6b7280;margin-top:12px;">
            You are receiving this email because alerts are enabled for this search.
          </div>
        </td>
      </tr>
    </table>
  </body>
</html>
`;
}

export async function sendSearchAlertEmail(input: SendSearchAlertEmailInput) {
    const apiKey = process.env.SENDGRID_API_KEY?.trim();

    if (!apiKey) {
        throw new Error("SENDGRID_API_KEY is not set.");
    }

    if (!input.items.length) {
        return;
    }

    const items = input.items.slice(0, 10);
    const fromEmail = buildFromEmail();
    const subject = buildSubject(input.searchItem, input.items.length);
    const textBody = buildTextBody(input.searchItem, items);
    const htmlBody = buildHtmlBody(input.searchItem, items);

    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            personalizations: [
                {
                    to: [{ email: input.to }],
                    subject,
                },
            ],
            from: {
                email: fromEmail,
                name: "GoSnaggit",
            },
            content: [
                {
                    type: "text/plain",
                    value: textBody,
                },
                {
                    type: "text/html",
                    value: htmlBody,
                },
            ],
        }),
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`SendGrid send failed: ${response.status} ${body}`);
    }
}