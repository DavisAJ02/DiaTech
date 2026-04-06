/**
 * Sidebar: desktop collapse + mobile off-canvas drawer.
 */
(function () {
  const LS_COLLAPSE = 'nexusops_sidebar_collapsed_v1';
  const MQ =
    typeof window.matchMedia === 'function' ? window.matchMedia('(max-width: 900px)') : { matches: false };

  function qs(sel) {
    return document.querySelector(sel);
  }

  function isMobile() {
    return MQ.matches;
  }

  function syncCollapseAria() {
    const btn = qs('.sidebar-collapse-btn');
    if (!btn) return;
    const collapsed = document.documentElement.classList.contains('sidebar-collapsed');
    btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    btn.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
  }

  function setDrawerOpen(open) {
    document.body.classList.toggle('sidebar-drawer-open', open);
    const sidebar = qs('.sidebar');
    sidebar?.classList.toggle('open', open);
    const menu = qs('#sidebar-menu-btn');
    if (menu) {
      menu.setAttribute('aria-expanded', open ? 'true' : 'false');
      menu.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    }
    const bd = qs('#sidebar-backdrop');
    if (bd) bd.setAttribute('aria-hidden', open ? 'false' : 'true');
    document.documentElement.style.overflow = open ? 'hidden' : '';
  }

  function closeDrawer() {
    setDrawerOpen(false);
  }

  function toggleDrawer() {
    setDrawerOpen(!document.body.classList.contains('sidebar-drawer-open'));
  }

  function applyCollapsedFromStorage() {
    if (isMobile()) return;
    try {
      if (localStorage.getItem(LS_COLLAPSE) === '1') {
        document.documentElement.classList.add('sidebar-collapsed');
      }
    } catch (_) {}
    syncCollapseAria();
  }

  function onViewportChange() {
    if (isMobile()) {
      document.documentElement.classList.remove('sidebar-collapsed');
      closeDrawer();
      syncCollapseAria();
    } else {
      applyCollapsedFromStorage();
    }
  }

  function injectControls() {
    const sidebar = qs('.sidebar');
    if (!sidebar || sidebar.dataset.sidebarNav === '1') return;
    sidebar.dataset.sidebarNav = '1';

    if (!qs('#sidebar-backdrop')) {
      const bd = document.createElement('div');
      bd.className = 'sidebar-backdrop';
      bd.id = 'sidebar-backdrop';
      bd.setAttribute('aria-hidden', 'true');
      document.body.appendChild(bd);
    }

    const logo = sidebar.querySelector('.sidebar-logo');
    if (logo && !qs('.sidebar-collapse-btn')) {
      const cb = document.createElement('button');
      cb.type = 'button';
      cb.className = 'sidebar-collapse-btn';
      cb.setAttribute('aria-expanded', 'true');
      cb.setAttribute('aria-label', 'Collapse sidebar');
      cb.innerHTML =
        '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M15 18l-6-6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      logo.appendChild(cb);
    }

    const topLeft = qs('.topbar .topbar-left');
    if (topLeft && !qs('#sidebar-menu-btn')) {
      const mb = document.createElement('button');
      mb.type = 'button';
      mb.id = 'sidebar-menu-btn';
      mb.className = 'sidebar-menu-btn';
      mb.setAttribute('aria-expanded', 'false');
      mb.setAttribute('aria-label', 'Open menu');
      mb.innerHTML =
        '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><line x1="4" y1="6" x2="20" y2="6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="4" y1="18" x2="20" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
      topLeft.insertBefore(mb, topLeft.firstChild);
    }
  }

  function bind() {
    injectControls();

    qs('.sidebar-collapse-btn')?.addEventListener('click', () => {
      if (isMobile()) return;
      document.documentElement.classList.toggle('sidebar-collapsed');
      try {
        localStorage.setItem(LS_COLLAPSE, document.documentElement.classList.contains('sidebar-collapsed') ? '1' : '0');
      } catch (_) {}
      syncCollapseAria();
    });

    qs('#sidebar-menu-btn')?.addEventListener('click', () => {
      if (!isMobile()) return;
      toggleDrawer();
    });

    qs('#sidebar-backdrop')?.addEventListener('click', closeDrawer);

    const sidebar = qs('.sidebar');
    sidebar?.querySelectorAll('.sidebar-nav a').forEach((a) => {
      a.addEventListener('click', () => {
        if (isMobile()) closeDrawer();
      });
    });
    sidebar?.querySelectorAll('.auth-logout-btn, .sidebar-logout').forEach((b) => {
      b.addEventListener('click', () => {
        if (isMobile()) closeDrawer();
      });
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isMobile() && document.body.classList.contains('sidebar-drawer-open')) {
        closeDrawer();
      }
    });

    if (typeof MQ.addEventListener === 'function') {
      MQ.addEventListener('change', onViewportChange);
    } else if (typeof MQ.addListener === 'function') {
      MQ.addListener(onViewportChange);
    }
  }

  function init() {
    if (!qs('.sidebar')) return;
    bind();
    applyCollapsedFromStorage();
    syncCollapseAria();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

