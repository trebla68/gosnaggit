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
