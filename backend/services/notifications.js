// services/notifications.js
// Supports separate SMTP identities for alerts and signup.

let nodemailer = null;
try {
  nodemailer = require('nodemailer');
} catch (e) {
  // nodemailer not installed yet; we'll fall back to stub
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function envBool(v, def = false) {
  if (v === undefined || v === null) return def;
  const s = String(v).toLowerCase().trim();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

function isSafeHttpUrl(url) {
  try {
    if (!url) return false;
    const u = new URL(String(url));
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function withClickTracking(url, { searchId, resultId, marketplace, customid }) {
  try {
    if (!url) return url;

    // Safety: only track http(s) URLs
    if (!isSafeHttpUrl(url)) return url;

    const base = String(process.env.PUBLIC_BACKEND_URL || "")
      .trim()
      .replace(/\/+$/, "");
    if (!base) return url;

    const qs =
      "url=" + encodeURIComponent(url) +
      "&search_id=" + encodeURIComponent(String(searchId || "")) +
      "&result_id=" + encodeURIComponent(String(resultId || "")) +
      "&marketplace=" + encodeURIComponent(String(marketplace || "")) +
      "&customid=" + encodeURIComponent(String(customid || ""));

    return `${base}/api/click?${qs}`;
  } catch {
    return url;
  }
}

function normalizeEbayUrl(url, { campid, customid }) {
  try {
    if (!url) return url;

    // Safety: only operate on http(s) URLs
    if (!isSafeHttpUrl(url)) return url;

    const parsed = new URL(url);

    // Only apply to ebay domains
    if (!/(^|\.)ebay\./i.test(parsed.hostname)) {
      return url;
    }

    if (campid) {
      parsed.searchParams.set("campid", String(campid));
    }

    if (customid) {
      parsed.searchParams.set("customid", String(customid));
    }

    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * sendEmail({
 *   to,
 *   subject,
 *   text,
 *   kind = "alerts"  // "alerts" | "signup"
 * })
 */
async function sendEmail({ to, subject, text, kind = "alerts" }) {
  if (!to) throw new Error("sendEmail: missing 'to'");
  if (!subject) throw new Error("sendEmail: missing 'subject'");
  if (!text) throw new Error("sendEmail: missing 'text'");

  // TEST switch: force email failures
  if (process.env.FORCE_EMAIL_FAIL === 'true') {
    throw new Error('TEST: forced email failure');
  }

  // Decide identity based on kind
  const isSignup = kind === "signup";

  const from = isSignup
    ? requireEnv('SIGNUP_FROM_EMAIL')
    : requireEnv('ALERTS_FROM_EMAIL');

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 465);
  const secure = envBool(process.env.SMTP_SECURE, true);

  const user = isSignup
    ? process.env.SIGNUP_SMTP_USER
    : process.env.ALERTS_SMTP_USER;

  const pass = isSignup
    ? process.env.SIGNUP_SMTP_PASS
    : process.env.ALERTS_SMTP_PASS;

  // If SMTP isn't configured, fall back to stub
  if (!host || !user || !pass || !nodemailer) {
    console.log('--- EMAIL (stub) ---');
    console.log('Kind:', kind);
    console.log('From:', from);
    console.log('To:', to);
    console.log('Subject:', subject);
    console.log(text);
    console.log('--- /EMAIL ---');
    return { ok: true, stub: true };
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

  const info = await transporter.sendMail({
    from,
    to,
    subject,
    text,
  });

  console.log('[email] sent', { kind, to, subject, messageId: info.messageId });
  return { ok: true, messageId: info.messageId };
}

/**
 * Build ONE email that contains multiple alerts.
 */
function buildAlertEmail({ searchId, alerts }) {
  const count = alerts.length;
  const subject =
    count === 1
      ? `GoSnaggit: New listing found (Search ${searchId})`
      : `GoSnaggit: ${count} new listings found (Search ${searchId})`;

  const lines = [];
  lines.push(`GoSnaggit found ${count} new listing${count === 1 ? '' : 's'} for Search ${searchId}:`);
  lines.push('');

  alerts.forEach((a, idx) => {
    lines.push(`${idx + 1}) ${a.title || '—'}`);
    lines.push(`   Price: ${a.price ? `${a.price} ${a.currency || ''}` : '—'}`);
    lines.push(`   Marketplace: ${a.marketplace || '—'}`);
    const customid = `search-${searchId}-alert-${a.alert_id || "na"}-result-${a.result_id || "na"}`;

    const normalizedDest = normalizeEbayUrl(a.listing_url, {
      campid: process.env.EBAY_CAMPAIGN_ID,
      customid,
    });

    const tracked = withClickTracking(normalizedDest, {
      searchId,
      resultId: a.result_id,
      marketplace: a.marketplace,
      customid,
    });

    lines.push(`   Link: ${tracked || '—'}`);
    lines.push(`   Alert ID: ${a.alert_id}`);
    lines.push('');
  });

  return { subject, text: lines.join('\n') };
}

/**
 * Build the customer-facing signup confirmation email.
 */
function buildSignupConfirmationEmail({ supportEmail }) {
  const subject = "Welcome to GoSnaggit 🚀";

  const lines = [];
  lines.push("Hi there,");
  lines.push("");
  lines.push("Thanks for registering for GoSnaggit.");
  lines.push("Your account is ready — you can start creating saved searches and get alerts when new results appear.");
  lines.push("");
  lines.push("If you have any questions, just reply to this email.");
  lines.push("");
  lines.push("— The GoSnaggit Team");
  if (supportEmail) lines.push(String(supportEmail));

  return { subject, text: lines.join('\n') };
}

/**
 * Build the internal new-signup notification email.
 */
function buildNewSignupNoticeEmail({ customerEmail, customerName, notes }) {
  const subject = "New GoSnaggit signup";

  const lines = [];
  lines.push("New signup received:");
  lines.push(`Name: ${customerName || "—"}`);
  lines.push(`Email: ${customerEmail || "—"}`);

  if (notes && String(notes).trim()) {
    lines.push("");
    lines.push("Notes:");
    lines.push(String(notes).trim());
  }

  lines.push("");
  lines.push("— GoSnaggit");

  return { subject, text: lines.join("\n") };
}


module.exports = {
  sendEmail,
  buildAlertEmail,
  buildSignupConfirmationEmail,
  buildNewSignupNoticeEmail,
};
