// services/notifications.js
// MVP notification sender: "email" is a stub that logs to server console.
// Later we can swap in SendGrid/Mailgun/etc.

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

async function sendEmail({ to, subject, text }) {
  const from = requireEnv('ALERTS_FROM_EMAIL');

  // MVP stub: log instead of sending
  console.log('--- EMAIL (stub) ---');
  console.log('From:', from);
  console.log('To:', to);
  console.log('Subject:', subject);
  console.log(text);
  console.log('--- /EMAIL ---');

  return { ok: true };
}

function buildAlertEmail({ searchId, alert }) {
  const subject = `GoSnaggit: New listing found (Search ${searchId})`;
  const lines = [
    `A new listing matched Search ${searchId}:`,
    '',
    `Title: ${alert.title || '—'}`,
    `Price: ${alert.price ? `${alert.price} ${alert.currency || ''}` : '—'}`,
    `Marketplace: ${alert.marketplace || '—'}`,
    `Link: ${alert.listing_url || '—'}`,
    '',
    `Alert ID: ${alert.alert_id}`,
  ];
  return { subject, text: lines.join('\n') };
}

module.exports = {
  sendEmail,
  buildAlertEmail,
};
