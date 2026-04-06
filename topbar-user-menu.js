(function () {
  function tr(key, fallback) {
    if (window.I18n && typeof window.I18n.t === "function") {
      return window.I18n.t(key, fallback);
    }
    return fallback;
  }

  function currentUser() {
    return window.Auth && typeof window.Auth.currentUser === 'function' ? window.Auth.currentUser() : null;
  }

  function roleLabel(user) {
    if (!user || !Array.isArray(user.roles) || !user.roles.length) return tr("common.role.workspace_member", 'Workspace member');
    if (user.roles.indexOf('admin') !== -1) return tr("common.role.administrator", 'Administrator');
    if (user.roles.indexOf('agent') !== -1) return tr("common.role.support_agent", 'Support agent');
    return user.roles[0].charAt(0).toUpperCase() + user.roles[0].slice(1);
  }

  function canOpenSettingsPage() {
    var u = currentUser();
    if (!u) return false;
    if (typeof userCanAccessPage === 'function') return userCanAccessPage('settings.html', u);
    return true;
  }

  function menuMarkup() {
    var user = currentUser() || {};
    var name = user.name || tr("common.user.fallback_name", 'DiaTech user');
    var email = user.email || tr("common.user.fallback_signed_in", 'Signed in');
    var role = roleLabel(user);
    var settingsOk = canOpenSettingsPage();
    var parts = [
      '<div class="user-dropdown-head">',
      '<div class="user-dropdown-identity">',
      '<div class="user-dropdown-avatar">' + (user.initials || 'DT') + '</div>',
      '<div class="user-dropdown-meta">',
      '<div class="user-dropdown-title">' + name + '</div>',
      '<div class="user-dropdown-sub">' + email + '</div>',
      '</div>',
      '</div>',
      '<div class="user-dropdown-role">' + role + '</div>',
      '</div>',
      '<div class="user-dropdown-divider"></div>'
    ];
    if (settingsOk) {
      parts.push(
        '<button type="button" class="dropdown-item profile" data-nav="settings.html#profile" role="menuitem"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg><span>' + tr("common.menu.profile", "Profile") + '</span></button>',
        '<button type="button" class="dropdown-item settings" data-nav="settings.html#security" role="menuitem"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg><span>' + tr("common.menu.settings", "Settings") + '</span></button>'
      );
    }
    parts.push(
      '<button type="button" class="dropdown-item logout" role="menuitem"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg><span>' + tr("common.menu.logout", "Log out") + '</span></button>'
    );
    return parts.join('');
  }

  function closeInlineMenus(except) {
    document.querySelectorAll('.user-menu').forEach(function (menu) {
      var trigger = menu.querySelector('.avatar, .avatar-circle, .sidebar-avatar');
      var dropdown = menu.querySelector('.user-dropdown');
      if (!dropdown || menu === except) return;
      dropdown.classList.remove('show');
      dropdown.setAttribute('aria-hidden', 'true');
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
    });
  }

  function ensureWrappedTrigger(trigger, menuClass) {
    if (!trigger) return null;
    var existing = trigger.closest('.user-menu');
    if (existing) {
      var existingDropdown = existing.querySelector('.user-dropdown');
      if (existingDropdown) existingDropdown.innerHTML = menuMarkup();
      return existing;
    }

    var wrapper = document.createElement('div');
    wrapper.className = 'user-menu ' + menuClass;
    trigger.parentNode.insertBefore(wrapper, trigger);
    wrapper.appendChild(trigger);

    var dropdown = document.createElement('div');
    dropdown.className = 'user-dropdown';
    dropdown.setAttribute('role', 'menu');
    dropdown.setAttribute('aria-hidden', 'true');
    dropdown.innerHTML = menuMarkup();
    wrapper.appendChild(dropdown);
    return wrapper;
  }

  function ensureMenuForAvatarCircle(circle) {
    return ensureWrappedTrigger(circle, 'topbar-user-menu');
  }

  function getSidebarPanel() {
    var panel = document.getElementById('sidebar-account-dropdown');
    if (panel) return panel;
    panel = document.createElement('div');
    panel.id = 'sidebar-account-dropdown';
    panel.className = 'user-dropdown sidebar-floating-dropdown';
    panel.setAttribute('role', 'menu');
    panel.setAttribute('aria-hidden', 'true');
    document.body.appendChild(panel);
    return panel;
  }

  function closeSidebarPanel() {
    var panel = document.getElementById('sidebar-account-dropdown');
    if (!panel) return;
    panel.classList.remove('show');
    panel.setAttribute('aria-hidden', 'true');
    document.querySelectorAll('.sidebar-footer .sidebar-avatar').forEach(function (avatar) {
      avatar.setAttribute('aria-expanded', 'false');
    });
  }

  function closeAll(except) {
    closeInlineMenus(except);
    closeSidebarPanel();
  }

  function bindInlineMenu(menu) {
    if (!menu || menu.dataset.userMenuReady === '1') return;
    var trigger = menu.querySelector('.avatar, .avatar-circle');
    var dropdown = menu.querySelector('.user-dropdown');
    if (!trigger || !dropdown) return;

    menu.dataset.userMenuReady = '1';
    if (!trigger.hasAttribute('tabindex')) trigger.tabIndex = 0;
    trigger.setAttribute('role', 'button');
    trigger.setAttribute('aria-haspopup', 'menu');
    trigger.setAttribute('aria-expanded', 'false');
    dropdown.setAttribute('aria-hidden', 'true');

    function toggle(force) {
      var next = typeof force === 'boolean' ? force : !dropdown.classList.contains('show');
      closeAll(next ? menu : null);
      dropdown.classList.toggle('show', next);
      dropdown.setAttribute('aria-hidden', next ? 'false' : 'true');
      trigger.setAttribute('aria-expanded', next ? 'true' : 'false');
    }

    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      toggle();
    });

    trigger.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
      if (e.key === 'Escape') {
        toggle(false);
      }
    });

    dropdown.addEventListener('click', function (e) {
      e.stopPropagation();
    });

    dropdown.querySelectorAll('.dropdown-item[data-nav]').forEach(function (item) {
      item.addEventListener('click', function (e) {
        e.preventDefault();
        var target = item.getAttribute('data-nav');
        if (target) window.location.href = target;
      });
    });

    var logout = dropdown.querySelector('.dropdown-item.logout');
    if (logout) {
      logout.addEventListener('click', function (e) {
        e.preventDefault();
        if (window.Auth && typeof window.Auth.logout === 'function') {
          window.Auth.logout();
        } else {
          window.location.href = 'login.html';
        }
      });
    }
  }

  function bindSidebarAvatar(avatar) {
    if (!avatar || avatar.dataset.sidebarMenuReady === '1') return;
    avatar.dataset.sidebarMenuReady = '1';
    if (!avatar.hasAttribute('tabindex')) avatar.tabIndex = 0;
    avatar.setAttribute('role', 'button');
    avatar.setAttribute('aria-haspopup', 'menu');
    avatar.setAttribute('aria-expanded', 'false');

    function openSidebarPanel() {
      var panel = getSidebarPanel();
      panel.innerHTML = menuMarkup();
      panel.classList.add('show');
      panel.setAttribute('aria-hidden', 'false');
      panel.style.visibility = 'hidden';

      var rect = avatar.getBoundingClientRect();
      var width = panel.offsetWidth || 212;
      var height = panel.offsetHeight || 220;
      var margin = 12;
      var collapsed = document.documentElement.classList.contains('sidebar-collapsed');
      var desiredLeft = collapsed ? rect.right + 12 : rect.left + 8;
      var desiredTop = rect.top - height - 10;
      var maxLeft = window.innerWidth - width - margin;
      var maxTop = window.innerHeight - height - margin;

      panel.style.left = Math.max(margin, Math.min(desiredLeft, maxLeft)) + 'px';
      panel.style.top = Math.max(margin, Math.min(desiredTop, maxTop)) + 'px';
      panel.style.visibility = '';
      avatar.setAttribute('aria-expanded', 'true');

      panel.querySelectorAll('.dropdown-item[data-nav]').forEach(function (item) {
        item.addEventListener('click', function (e) {
          e.preventDefault();
          var target = item.getAttribute('data-nav');
          if (target) window.location.href = target;
        });
      });

      var logout = panel.querySelector('.dropdown-item.logout');
      if (logout) {
        logout.addEventListener('click', function (e) {
          e.preventDefault();
          if (window.Auth && typeof window.Auth.logout === 'function') {
            window.Auth.logout();
          } else {
            window.location.href = 'login.html';
          }
        });
      }

      panel.addEventListener('click', function (e) {
        e.stopPropagation();
      }, { once: true });
    }

    function toggleSidebarPanel() {
      var panel = getSidebarPanel();
      var open = panel.classList.contains('show') && avatar.getAttribute('aria-expanded') === 'true';
      closeAll();
      if (!open) openSidebarPanel();
    }

    avatar.addEventListener('click', function (e) {
      e.stopPropagation();
      toggleSidebarPanel();
    });

    avatar.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleSidebarPanel();
      }
      if (e.key === 'Escape') {
        closeAll();
      }
    });
  }

  function init() {
    document.querySelectorAll('.avatar-circle').forEach(function (circle) {
      var menu = ensureMenuForAvatarCircle(circle);
      bindInlineMenu(menu);
    });
    document.querySelectorAll('.sidebar-footer .sidebar-avatar').forEach(bindSidebarAvatar);

    document.addEventListener('click', function () {
      closeAll();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeAll();
    });

    window.addEventListener('resize', function () {
      closeAll();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
