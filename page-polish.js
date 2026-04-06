(function () {
  var meta = {
    'tickets.html': {
      eyebrow: 'Operations',
      title: 'Ticket coordination',
      sub: 'Track incoming work, prioritize urgent issues, and keep assignment flow moving without losing SLA visibility.',
      badge: 'Live queue'
    },
    'departments.html': {
      eyebrow: 'Relationships',
      title: 'Department overview',
      sub: 'See service footprint, alert pressure, and account activity in one quick scan before jumping into details.',
      badge: 'Accounts'
    },
    'devices.html': {
      eyebrow: 'Monitoring',
      title: 'Device fleet',
      sub: 'Keep deployment, health, and endpoint visibility organized with a cleaner operational inventory view.',
      badge: 'Fleet health'
    },
    'inventory.html': {
      eyebrow: 'Asset control',
      title: 'Inventory governance',
      sub: 'Review lifecycle, ownership, procurement traceability, and stock posture from one structured workspace.',
      badge: 'Asset ledger'
    },
    'budget.html': {
      eyebrow: 'Finance',
      title: 'Budget control',
      sub: 'Compare spend against budget, highlight pressure areas, and keep IT purchasing tied back to the right records.',
      badge: 'Monthly spend'
    },
    'alerts.html': {
      eyebrow: 'Response',
      title: 'Alert center',
      sub: 'Separate signal from noise, acknowledge critical items quickly, and keep operational events easy to act on.',
      badge: 'Priority feed'
    },
    'reports.html': {
      eyebrow: 'Insights',
      title: 'Executive reporting',
      sub: 'Present service trends, performance signals, and export-ready summaries in a cleaner reporting surface.',
      badge: 'Decision ready'
    },
    'it-analytics.html': {
      eyebrow: 'Strategy',
      title: 'IT analytics',
      sub: 'Turn asset and expense data into clearer planning signals with stronger visual hierarchy and easier comparison.',
      badge: 'Planning view'
    },
    'settings.html': {
      eyebrow: 'Administration',
      title: 'Workspace controls',
      sub: 'Manage access, security, and operating preferences in a cleaner control surface built for day-to-day administration.',
      badge: 'Admin area'
    }
  };

  function pageName() {
    var bits = window.location.pathname.split('/');
    return bits[bits.length - 1] || 'index.html';
  }

  function buildIntro(cfg) {
    var section = document.createElement('section');
    section.className = 'page-intro';
    section.innerHTML = [
      '<div class="page-intro-card">',
      '<div class="page-intro-copy">',
      '<div class="page-intro-eyebrow">' + cfg.eyebrow + '</div>',
      '<div class="page-intro-title">' + cfg.title + '</div>',
      '<p class="page-intro-sub">' + cfg.sub + '</p>',
      '</div>',
      '<div class="page-intro-meta">',
      '<span class="page-intro-badge">' + cfg.badge + '</span>',
      '<span class="page-intro-date">' + new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) + '</span>',
      '</div>',
      '</div>'
    ].join('');
    return section;
  }

  function init() {
    var name = pageName().toLowerCase();
    var cfg = meta[name];
    if (!cfg) return;
    document.body.setAttribute('data-page', name.replace('.html', ''));
    if (document.querySelector('.page-intro')) return;

    var anchor = document.querySelector('.content-pad');
    if (!anchor || !anchor.parentNode) return;
    anchor.parentNode.insertBefore(buildIntro(cfg), anchor);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
