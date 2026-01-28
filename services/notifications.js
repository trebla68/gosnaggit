// services/notifications.js
// MVP notification sender: "email" is a stub that logs to server console.
// Later we can swap in SendGrid/Mailgun/etc.

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

async function sendEmail({ to, subject, text }) {
  const from = requireEnv('ALERTS_FROM_EMAIL');

  // TEST switch: force email failures to validate retry/backoff behavior
  if (process.env.FORCE_EMAIL_FAIL === 'true') {
    throw new Error('TEST: forced email failure');
  }

  // If SMTP isn't configured, fall back to stub so app still works
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 465);
  const secure = String(process.env.SMTP_SECURE || 'true') === 'true';
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass || !nodemailer) {
    console.log('--- EMAIL (stub) ---');
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

    // optional safety:
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

  const info = await transporter.sendMail({
    from, // what recipients see
    to,   // user email
    subject,
    text,
  });

  console.log('[email] sent', { to, subject, messageId: info.messageId });
  return { ok: true, messageId: info.messageId };
}

/**
 * Build ONE email that contains multiple alerts.
 * This prevents "one email per listing" spam and scales better.
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
    lines.push(`   Link: ${a.listing_url || '—'}`);
    lines.push(`   Alert ID: ${a.alert_id}`);
    lines.push('');
  });

  return { subject, text: lines.join('\n') };
}

module.exports = {
  sendEmail,
  buildAlertEmail,
};
