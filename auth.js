// ============================
// DiaTech – Client auth (demo)
// ============================
// Session in localStorage. Replace login() with API call in production.
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

  function writeStored(userId) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ userId, savedAt: Date.now() }));
  }

  function clearStored() {
    localStorage.removeItem(STORAGE_KEY);
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

  function login(username, password) {
    const u = DB.users.find(
      (x) =>
        x.active &&
        String(x.username).toLowerCase() === String(username).trim().toLowerCase()
    );
    if (!u) return { ok: false, error: 'Invalid username or password' };
    if (u.passwordDemo !== password)
      return { ok: false, error: 'Invalid username or password' };
    if (typeof setSessionUser === 'function') setSessionUser(u.id);
    writeStored(u.id);
    return { ok: true, user: u };
  }

  function logout() {
    clearStored();
    if (typeof clearSession === 'function') clearSession();
    window.location.href = 'login.html';
  }

  function currentUser() {
    return typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  }

  function hasRole(role) {
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

  function guard() {
    const path = pageName().toLowerCase();

    if (path === 'login.html') {
      if (restoreSession() && currentUser()) {
        const q = new URLSearchParams(window.location.search);
        window.location.replace(safeReturnPath(q.get('return')));
      }
      return;
    }

    if (!restoreSession() || !currentUser()) {
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
    if (pageName().toLowerCase() === 'login.html') return;

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

    document.querySelectorAll('.sidebar-nav a[href$=".html"]').forEach((el) => {
      if (hasRole('admin')) {
        el.hidden = false;
        return;
      }
      const href = el.getAttribute('href') || '';
      const file = href.split('/').pop().toLowerCase();
      if (file && typeof userCanAccessPage === 'function') {
        el.hidden = !userCanAccessPage(file, u);
      }
    });

    document.querySelectorAll('.auth-logout-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        logout();
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
  };
})(typeof window !== 'undefined' ? window : this);

