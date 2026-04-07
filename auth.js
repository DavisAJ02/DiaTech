// ============================
// DiaTech – Client auth (Supabase)
// ============================
// Connexion via Supabase Auth + public.profiles (rôle). Pas de comptes locaux / démo.
(function (global) {
  const STORAGE_KEY = 'nexusops_session_v1';

  function readStored() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function clearStored() {
    localStorage.removeItem(STORAGE_KEY);
  }

  function isSupabaseConfiguredSync() {
    const p = typeof window !== 'undefined' ? window.__DIATECH_PUBLIC__ : null;
    return Boolean(
      p && String(p.supabaseUrl || '').trim() && String(p.supabaseAnonKey || '').trim()
    );
  }

  async function tryHydrateSupabase() {
    const mod = await import('./supabase-session.mjs');
    await mod.hydrateFromSupabase();
  }

  function restoreSession() {
    const data = readStored();
    if (!data || data.userId == null) return false;
    const u = typeof getUserById === 'function' ? getUserById(data.userId) : null;
    if (!u || !u.active) {
      clearStored();
      if (typeof clearSession === 'function') clearSession();
      return false;
    }
    if (typeof setSessionUser === 'function') setSessionUser(u.id);
    return true;
  }

  function login(_username, _password) {
    return {
      ok: false,
      error:
        'La connexion par compte local est désactivée. Utilisez votre adresse e-mail CMD et le mot de passe Supabase.',
    };
  }

  async function logout() {
    clearStored();
    if (isSupabaseConfiguredSync()) {
      try {
        const m = await import('./supabase-session.mjs');
        await m.signOutSupabase();
      } catch (_e) {
        /* ignore */
      }
    }
    if (typeof clearSession === 'function') clearSession();
    window.location.href = 'login.html';
  }

  function currentUser() {
    return typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  }

  function hasRole(role) {
    const r = String(role || '').toLowerCase();
    if (
      (r === 'admin' || r === 'agent' || r === 'user') &&
      typeof global.RoleUi !== 'undefined' &&
      global.RoleUi.syncCurrentUserRole
    ) {
      global.RoleUi.syncCurrentUserRole();
      return global.RoleUi.hasRole(r);
    }
    const u = currentUser();
    return !!(u && u.roles && u.roles.includes(role));
  }

  function pageName() {
    const p = window.location.pathname.split('/').pop();
    return p || 'index.html';
  }

  function safeReturnPath(ret) {
    if (!ret || typeof ret !== 'string') return 'index.html';
    if (ret.includes('..') || ret.includes('/') || ret.includes('\\')) return 'index.html';
    if (!/^[a-z0-9._-]+\.html$/i.test(ret)) return 'index.html';
    if (ret.toLowerCase() === 'login.html') return 'index.html';
    return ret;
  }

  async function guard() {
    const path = pageName().toLowerCase();

    let authed = false;

    if (isSupabaseConfiguredSync()) {
      document.documentElement.classList.add('auth-booting');
      try {
        await tryHydrateSupabase();
        authed = !!currentUser();
      } catch (e) {
        console.warn('[DiaTech] Supabase hydrate', e);
      } finally {
        document.documentElement.classList.remove('auth-booting');
      }
    }

    if (path === 'login.html') {
      if (authed) {
        const q = new URLSearchParams(window.location.search);
        window.location.replace(safeReturnPath(q.get('return')));
      }
      return;
    }

    if (path === 'mfa-enroll.html' || path === 'mfa-verify.html') {
      if (!authed) {
        window.location.replace('login.html?return=' + encodeURIComponent(pageName()));
      }
      return;
    }

    if (!authed) {
      window.location.replace('login.html?return=' + encodeURIComponent(pageName()));
      return;
    }

    const html = document.documentElement;
    const needAdmin = html.getAttribute('data-require-role') === 'admin';
    if (needAdmin && !hasRole('admin')) {
      window.location.replace('index.html?access=forbidden');
      return;
    }

    const u = currentUser();
    const pathLower = pageName().toLowerCase();
    if (
      u &&
      typeof userCanAccessPage === 'function' &&
      !hasRole('admin') &&
      !userCanAccessPage(pathLower, u)
    ) {
      window.location.replace('index.html?access=noscope');
    }
  }

  function enhanceUI() {
    const pn = pageName().toLowerCase();
    if (pn === 'login.html' || pn === 'mfa-verify.html' || pn === 'mfa-enroll.html') return;

    const u = currentUser();
    if (!u) return;

    document.querySelectorAll('.sidebar-avatar').forEach((el) => {
      el.textContent = u.initials;
      el.title = u.name;
    });
    document.querySelectorAll('.avatar-circle, #userAvatar').forEach((el) => {
      el.textContent = u.initials;
      el.title = u.name;
    });

    document.querySelectorAll('.nav-admin-only').forEach((el) => {
      el.hidden = !hasRole('admin');
    });

    if (typeof global.RoleUi !== 'undefined' && global.RoleUi.applySidebarNavVisibility) {
      global.RoleUi.applySidebarNavVisibility();
    } else {
      document.querySelectorAll('.sidebar-nav a[href$=".html"]').forEach((el) => {
        if (hasRole('admin')) {
          el.hidden = false;
          el.style.display = '';
          return;
        }
        const href = el.getAttribute('href') || '';
        const file = href.split('/').pop().toLowerCase();
        if (file && typeof userCanAccessPage === 'function') {
          const ok = userCanAccessPage(file, u);
          el.hidden = !ok;
          el.style.display = ok ? '' : 'none';
        }
      });
    }

    document.querySelectorAll('.auth-logout-btn').forEach((btn) => {
      if (btn.dataset.diatechAuthBound === '1') return;
      btn.dataset.diatechAuthBound = '1';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        void logout();
      });
    });

    const params = new URLSearchParams(window.location.search);
    const access = params.get('access');
    if (access === 'forbidden' || access === 'noscope') {
      const main = document.querySelector('.main-content');
      if (main) {
        const bar = document.createElement('div');
        bar.className = 'auth-flash auth-flash--error';
        bar.setAttribute('role', 'alert');
        bar.textContent =
          access === 'noscope'
            ? 'Your account is not allowed to open that area. Contact an administrator.'
            : 'You do not have permission to view that page. Admin access is required.';
        main.insertBefore(bar, main.firstChild);
      }
      window.history.replaceState({}, '', window.location.pathname);
    }
  }

  global.Auth = {
    login,
    logout,
    restoreSession,
    guard,
    enhanceUI,
    hasRole,
    currentUser,
    isSupabaseConfigured: isSupabaseConfiguredSync,
  };
})(typeof window !== 'undefined' ? window : this);
