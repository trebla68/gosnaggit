/* GoSnaggit global UI system (Phase B) */
(function () {
  function currentPage() {
    const p = (window.location.pathname || '').split('/').filter(Boolean).pop();
    return p || 'index.html';
  }

  function activeNavKey(page) {
    // Sub-pages should highlight "Saved searches"
    const savedBucket = new Set(['search-detail.html', 'search-results.html', 'edit-search.html', 'search-alerts.html']);
    if (savedBucket.has(page)) return 'searches.html';
    return page;
  }

  function injectHeader() {
    const mount = document.getElementById('gs-header');
    if (!mount) return;

    const page = currentPage();
    const active = activeNavKey(page);

    const nav = [
      { href: 'index.html', label: 'Home' },
      { href: 'search.html', label: 'New search' },
      { href: 'searches.html', label: 'Saved searches' },
      { href: 'deleted-searches.html', label: 'Deleted' }
    ];

    const tagline = 'Find it first';

    mount.innerHTML = `
      <div class="inner">
        <a class="gs-brand" href="index.html" aria-label="GoSnaggit Home">
          <span class="gs-brand-badge" aria-hidden="true">G</span>
          <span class="gs-brand-text">
            <span class="name">GoSnaggit</span>
            <span class="tag">${tagline}</span>
          </span>
        </a>

        <nav class="gs-nav" aria-label="Primary">
          ${nav
            .map((n) => {
              const isActive = n.href === active;
              return `<a href="${n.href}" class="${isActive ? 'is-active' : ''}">${n.label}</a>`;
            })
            .join('')}
        </nav>
      </div>
    `;
  }

  document.addEventListener('DOMContentLoaded', function(){
    try {
      document.body.classList.add('gs-app');
      if (activeNavKey(currentPage()) === 'index.html') document.body.classList.add('gs-index');
    } catch (e) {}
  });

  document.addEventListener('DOMContentLoaded', injectHeader);
})();



// ---- Alert settings client helper (server-backed) ----
(function(){
  const DEFAULTS = { enabled: true, mode: 'immediate', maxPerEmail: 25 };

  function normalize(s){
    const out = Object.assign({}, DEFAULTS, (s || {}));
    out.enabled = !!out.enabled;
    out.mode = (out.mode === 'daily') ? 'daily' : 'immediate';
    const mpe = Number(out.maxPerEmail);
    out.maxPerEmail = Number.isFinite(mpe) && mpe > 0 ? Math.min(200, Math.max(1, Math.floor(mpe))) : 25;
    return out;
  }

  async function getAlertSettings(searchId){
    const sid = Number(searchId);
    if (!Number.isFinite(sid) || sid <= 0) return normalize(DEFAULTS);
    try {
      const r = await fetch(`/api/searches/${sid}/alert-settings`);
      const j = await r.json();
      return normalize(j && j.settings);
    } catch (e) {
      // fallback: localStorage (best effort)
      try {
        const raw = localStorage.getItem('gosnaggit.alertSettings.' + String(sid));
        return raw ? normalize(JSON.parse(raw)) : normalize(DEFAULTS);
      } catch(e2) {
        return normalize(DEFAULTS);
      }
    }
  }

  async function setAlertSettings(searchId, settings){
    const sid = Number(searchId);
    if (!Number.isFinite(sid) || sid <= 0) return { ok:false };
    const payload = { settings: normalize(settings) };
    try {
      const r = await fetch(`/api/searches/${sid}/alert-settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const j = await r.json();
      // keep localStorage mirror for dev convenience
      try { localStorage.setItem('gosnaggit.alertSettings.' + String(sid), JSON.stringify(payload.settings)); } catch(e){}
      return j && j.ok ? j : { ok:false };
    } catch (e) {
      // fallback: localStorage only
      try { localStorage.setItem('gosnaggit.alertSettings.' + String(sid), JSON.stringify(payload.settings)); } catch(e2){}
      return { ok:true, settings: payload.settings, localOnly:true };
    }
  }

  window.GoSnaggit = window.GoSnaggit || {};
  window.GoSnaggit.getAlertSettings = getAlertSettings;
  window.GoSnaggit.setAlertSettings = setAlertSettings;
})();
