(function (global) {
  var STORAGE_KEY = "ti_dashboard_lang";
  var DEFAULT_LANG = "fr";
  var observer = null;
  var rafToken = 0;

  var messages = {
    fr: {
      "login.meta.title": "DiaTech - Connexion",
      "login.welcome.kicker": "Bienvenue",
      "login.welcome.title": "sur votre portail TI",
      "login.welcome.desc": "Gerez vos tickets, appareils et alertes depuis une seule plateforme securisee.",
      "login.feature.tickets": "Gestion des tickets TI",
      "login.feature.devices": "Surveillance des appareils",
      "login.feature.alerts": "Alertes en temps reel",
      "login.feature.reports": "Rapports et analytiques",
      "login.signin.title": "Connexion",
      "login.signin.subtitle": "Utilisez votre compte de travail CMD pour acceder a DiaTech.",
      "login.username.label": "Nom d'utilisateur",
      "login.password.label": "Mot de passe",
      "login.username.placeholder": "ex. david-adrien.ntumba",
      "login.password.placeholder": "••••••••",
      "login.submit": "Se connecter ->",
      "login.demo.title": "Comptes de demonstration",
      "login.demo.access": "Acces de test",

      "index.meta.title": "DiaTech - Plateforme de gestion TI",
      "index.page.title": "Tableau de bord",
      "index.search.placeholder": "Rechercher tickets, appareils...",
      "index.install.agent": "Installer l'agent",
      "index.kpi.open.label": "Tickets ouverts",
      "index.kpi.open.sub": "↑ 12 cette semaine",
      "index.kpi.pending.label": "En attente",
      "index.kpi.pending.sub": "↓ 5 depuis hier",
      "index.kpi.overdue.label": "En retard",
      "index.kpi.overdue.sub": "⚠ Necessite une action",
      "index.kpi.online.label": "Appareils en ligne",
      "index.kpi.online.sub": "↑ 4 nouvellement connectes",
      "index.kpi.critical.label": "Alertes critiques",
      "index.kpi.critical.sub": "3 non reconnues",
      "index.kpi.csat.label": "Score CSAT",
      "index.kpi.csat.sub": "★★★★★ Excellent",

      "index.hero.lead.kicker": "Centre de commande DiaTech",
      "index.hero.lead.title": "Des opérations de service calmes, lisibles et toujours en avance sur le risque.",
      "index.hero.lead.copy": "Pilotez en un seul écran la charge des tickets, la santé des actifs et l'escalade des alertes — une vue opérationnelle conçue pour décider vite, chaque jour.",
      "index.hero.cta.queue": "Traiter les priorités",
      "index.hero.cta.report": "Rapport de direction",
      "index.hero.sla.label": "Pouls SLA",
      "index.hero.critical.label": "Charge critique",
      "index.hero.fleet.label": "Parc actif",
      "index.hero.focus.label": "Priorité du jour",
      "index.hero.loading": "Chargement…",
      "index.hero.sla.note.on_target_month": "Dans les temps ce mois-ci",
      "index.hero.sla.note.breach_one": "{bad} cloture hors delai SLA · {total} fermee ce mois-ci",
      "index.hero.sla.note.breach_many": "{bad} clotures hors delai SLA · {total} fermees ce mois-ci",
      "index.hero.sla.note.no_open": "Aucun ticket ouvert",
      "index.hero.sla.note.queue_ok": "File actuelle dans les delais SLA",
      "index.hero.sla.note.over_one": "{n} ticket actif hors delai SLA",
      "index.hero.sla.note.over_many": "{n} tickets actifs hors delai SLA",
      "index.hero.critical.need_now": "{n} a traiter maintenant",
      "index.hero.critical.all_moving": "Critiques / hauts : pris en charge",
      "index.hero.critical.none": "Aucun critique / haut en file",
      "index.hero.fleet.breakdown": "{inv} inventaire · {online} parc en ligne",
      "index.hero.fleet.empty": "Ajoutez inventaire ou appareils pour suivre la sante",
      "index.hero.focus.title.backlog": "Arriere",
      "index.hero.focus.title.critical_queue": "File critique",
      "index.hero.focus.title.assignments": "Affectations",
      "index.hero.focus.title.queue": "File",
      "index.hero.focus.title.steady": "Stable",
      "index.hero.focus.note.backlog": "{n} en retard SLA · traiter les depassements en premier",
      "index.hero.focus.note.critical": "{n} critiques / hauts a traiter maintenant",
      "index.hero.focus.note.unassigned": "{n} non assignes · prendre en charge",
      "index.hero.focus.note.open_one": "{n} ticket ouvert · garder le flux",
      "index.hero.focus.note.open_many": "{n} tickets ouverts · garder le flux",
      "index.hero.focus.note.steady": "Pas de signal SLA ou affectation urgent",

      "settings.meta.title": "DiaTech - Parametres",
      "settings.page.title": "Parametres",
      "settings.nav.profile": "Profil",
      "settings.nav.notifications": "Notifications",
      "settings.nav.integrations": "Integrations",
      "settings.nav.security": "Securite",
      "settings.nav.users": "Utilisateurs et acces",
      "settings.nav.backup": "Sauvegarde des donnees",
      "settings.backup.title": "Export / import JSON (serveur)",
      "settings.backup.intro": "Telechargez une copie complete des donnees stockees sur le serveur (inventaire, tickets, depenses, etc.). Importez un fichier pour restaurer ou migrer — cela remplace toutes les donnees distantes.",
      "settings.backup.export": "Exporter JSON",
      "settings.backup.import": "Importer JSON",
      "settings.backup.import_hint": "Fichier .json exporte depuis DiaTech ou compatible.",
      "settings.backup.confirm_title": "Remplacer toutes les donnees sur le serveur ?",
      "settings.backup.confirm_counts": "Inventaire: {inv} · Tickets: {tix} · Depenses: {exp} · Appareils: {dev}",
      "settings.backup.type_confirm": "Tapez REMPLACER pour confirmer",
      "settings.backup.success": "Import reussi. Rechargement…",
      "settings.backup.error_api": "API indisponible ou erreur reseau.",
      "settings.backup.error_parse": "Fichier JSON invalide.",
      "settings.backup.error_save": "Echec de l'enregistrement (HTTP {status}).",
      "settings.profile.title": "Informations du profil",
      "settings.profile.fullname": "Nom complet",
      "settings.profile.email": "Email",
      "settings.profile.role": "Role",
      "settings.profile.lang.label": "Langue de l'interface",
      "settings.profile.lang.fr": "Francais",
      "settings.profile.lang.en": "English",
      "settings.btn.cancel": "Annuler",
      "settings.btn.save_changes": "Enregistrer les modifications",
      "settings.appearance.title": "Apparence et theme",
      "settings.appearance.theme.label": "Theme de l'interface",
      "settings.appearance.theme.sub": "Basculer entre le mode clair et le mode sombre pour l'espace de travail.",
      "settings.appearance.theme.toggle": "Basculer le mode sombre",

      "common.nav.dashboard": "Tableau de bord",
      "common.nav.tickets": "Tickets",
      "common.nav.departments": "Départements",
      "common.nav.devices": "Appareils",
      "common.nav.inventory": "Inventaire",
      "common.nav.budget": "Budget",
      "common.nav.alerts": "Alertes",
      "common.nav.reports": "Rapports",
      "common.nav.analytics": "Analytique",
      "common.logout": "Deconnexion",
      "common.menu.profile": "Profil",
      "common.menu.settings": "Parametres",
      "common.menu.logout": "Deconnexion",
      "common.role.workspace_member": "Membre de l'espace",
      "common.role.administrator": "Administrateur",
      "common.role.support_agent": "Agent support",
      "common.user.fallback_name": "Utilisateur DiaTech",
      "common.user.fallback_signed_in": "Connecte",
    },
    en: {
      "login.meta.title": "DiaTech - Sign in",
      "login.welcome.kicker": "Welcome",
      "login.welcome.title": "to your IT portal",
      "login.welcome.desc": "Manage tickets, devices, and alerts from one secure platform.",
      "login.feature.tickets": "IT ticket management",
      "login.feature.devices": "Device monitoring",
      "login.feature.alerts": "Real-time alerts",
      "login.feature.reports": "Reports and analytics",
      "login.signin.title": "Sign in",
      "login.signin.subtitle": "Use your CMD work account to access DiaTech.",
      "login.username.label": "Username",
      "login.password.label": "Password",
      "login.username.placeholder": "e.g. david-adrien.ntumba",
      "login.password.placeholder": "••••••••",
      "login.submit": "Sign in ->",
      "login.demo.title": "Demo accounts",
      "login.demo.access": "Test access",

      "index.meta.title": "DiaTech - IT management platform",
      "index.page.title": "Dashboard",
      "index.search.placeholder": "Search tickets, devices...",
      "index.install.agent": "Install agent",
      "index.kpi.open.label": "Open tickets",
      "index.kpi.open.sub": "↑ 12 this week",
      "index.kpi.pending.label": "Pending",
      "index.kpi.pending.sub": "↓ 5 since yesterday",
      "index.kpi.overdue.label": "Overdue",
      "index.kpi.overdue.sub": "⚠ Needs attention",
      "index.kpi.online.label": "Online devices",
      "index.kpi.online.sub": "↑ 4 just connected",
      "index.kpi.critical.label": "Critical alerts",
      "index.kpi.critical.sub": "3 unacknowledged",
      "index.kpi.csat.label": "CSAT score",
      "index.kpi.csat.sub": "★★★★★ Excellent",

      "index.hero.lead.kicker": "DiaTech command center",
      "index.hero.lead.title": "Keep service operations calm, visible, and ahead of risk.",
      "index.hero.lead.copy": "Monitor ticket pressure, asset health, and alert escalation from one flagship view designed for fast daily decision-making.",
      "index.hero.cta.queue": "Review priority queue",
      "index.hero.cta.report": "Open executive report",
      "index.hero.sla.label": "SLA pulse",
      "index.hero.critical.label": "Critical load",
      "index.hero.fleet.label": "Active fleet",
      "index.hero.focus.label": "Daily focus",
      "index.hero.loading": "Loading…",
      "index.hero.sla.note.on_target_month": "On target this month",
      "index.hero.sla.note.breach_one": "{bad} closure past SLA · {total} closed MTD",
      "index.hero.sla.note.breach_many": "{bad} closures past SLA · {total} closed MTD",
      "index.hero.sla.note.no_open": "No open tickets",
      "index.hero.sla.note.queue_ok": "Queue within SLA right now",
      "index.hero.sla.note.over_one": "{n} active ticket over SLA",
      "index.hero.sla.note.over_many": "{n} active tickets over SLA",
      "index.hero.critical.need_now": "{n} need action now",
      "index.hero.critical.all_moving": "All critical/high owned & in motion",
      "index.hero.critical.none": "No critical/high in queue",
      "index.hero.fleet.breakdown": "{inv} inventory · {online} fleet online",
      "index.hero.fleet.empty": "Add inventory or fleet devices to track health",
      "index.hero.focus.title.backlog": "Backlog",
      "index.hero.focus.title.critical_queue": "Critical queue",
      "index.hero.focus.title.assignments": "Assignments",
      "index.hero.focus.title.queue": "Queue",
      "index.hero.focus.title.steady": "Steady",
      "index.hero.focus.note.backlog": "{n} overdue SLA · resolve breaches first",
      "index.hero.focus.note.critical": "{n} critical/high need action now",
      "index.hero.focus.note.unassigned": "{n} unassigned · pick up ownership",
      "index.hero.focus.note.open_one": "{n} open ticket · keep flow moving",
      "index.hero.focus.note.open_many": "{n} open tickets · keep flow moving",
      "index.hero.focus.note.steady": "No urgent SLA or assignment flags",

      "settings.meta.title": "DiaTech - Settings",
      "settings.page.title": "Settings",
      "settings.nav.profile": "Profile",
      "settings.nav.notifications": "Notifications",
      "settings.nav.integrations": "Integrations",
      "settings.nav.security": "Security",
      "settings.nav.users": "Users and access",
      "settings.nav.backup": "Data backup",
      "settings.backup.title": "JSON export / import (server)",
      "settings.backup.intro": "Download a full snapshot of server-side data (inventory, tickets, expenses, etc.). Import a file to restore or migrate — this replaces all remote data.",
      "settings.backup.export": "Export JSON",
      "settings.backup.import": "Import JSON",
      "settings.backup.import_hint": ".json file exported from DiaTech or compatible.",
      "settings.backup.confirm_title": "Replace all data on the server?",
      "settings.backup.confirm_counts": "Inventory: {inv} · Tickets: {tix} · Expenses: {exp} · Devices: {dev}",
      "settings.backup.type_confirm": "Type REPLACE to confirm",
      "settings.backup.success": "Import successful. Reloading…",
      "settings.backup.error_api": "API unavailable or network error.",
      "settings.backup.error_parse": "Invalid JSON file.",
      "settings.backup.error_save": "Save failed (HTTP {status}).",
      "settings.profile.title": "Profile information",
      "settings.profile.fullname": "Full name",
      "settings.profile.email": "Email",
      "settings.profile.role": "Role",
      "settings.profile.lang.label": "Interface language",
      "settings.profile.lang.fr": "Francais",
      "settings.profile.lang.en": "English",
      "settings.btn.cancel": "Cancel",
      "settings.btn.save_changes": "Save changes",
      "settings.appearance.title": "Appearance and theme",
      "settings.appearance.theme.label": "Interface theme",
      "settings.appearance.theme.sub": "Switch between the default light interface and dark mode for the workspace.",
      "settings.appearance.theme.toggle": "Toggle dark mode",

      "common.nav.dashboard": "Dashboard",
      "common.nav.tickets": "Tickets",
      "common.nav.departments": "Departments",
      "common.nav.devices": "Devices",
      "common.nav.inventory": "Inventory",
      "common.nav.budget": "Budget",
      "common.nav.alerts": "Alerts",
      "common.nav.reports": "Reports",
      "common.nav.analytics": "Analytics",
      "common.logout": "Log out",
      "common.menu.profile": "Profile",
      "common.menu.settings": "Settings",
      "common.menu.logout": "Log out",
      "common.role.workspace_member": "Workspace member",
      "common.role.administrator": "Administrator",
      "common.role.support_agent": "Support agent",
      "common.user.fallback_name": "DiaTech user",
      "common.user.fallback_signed_in": "Signed in",
    },
  };

  var exactPairs = [
    ["Dashboard", "Tableau de bord"],
    ["Tickets", "Tickets"],
    ["Departments", "Départements"],
    ["Devices", "Appareils"],
    ["Inventory", "Inventaire"],
    ["Budget", "Budget"],
    ["Alerts", "Alertes"],
    ["Reports", "Rapports"],
    ["Analytics", "Analytique"],
    ["Log out", "Deconnexion"],
    ["Settings", "Parametres"],
    ["Profile", "Profil"],
    ["Notifications", "Notifications"],
    ["Integrations", "Integrations"],
    ["Security", "Securite"],
    ["Users & access", "Utilisateurs et acces"],
    ["Users and access", "Utilisateurs et acces"],
    ["New Ticket", "Nouveau ticket"],
    ["Create New Ticket", "Creer un ticket"],
    ["Edit Ticket", "Modifier le ticket"],
    ["Create Ticket", "Creer le ticket"],
    ["Cancel", "Annuler"],
    ["Save Changes", "Enregistrer les modifications"],
    ["All", "Tous"],
    ["Open", "Ouvert"],
    ["Critical", "Critique"],
    ["Unassigned", "Non assigne"],
    ["Search tickets...", "Rechercher des tickets..."],
    ["Search tickets…", "Rechercher des tickets..."],
    ["All Priorities", "Toutes les priorites"],
    ["Priority", "Priorite"],
    ["All SLA", "Tous les SLA"],
    ["Breached", "Depasse"],
    ["Warning", "Alerte"],
    ["Status", "Statut"],
    ["Details", "Details"],
    ["Assignee", "Assigne"],
    ["Action", "Action"],
    ["Title", "Titre"],
    ["Description", "Description"],
    ["In Progress", "En cours"],
    ["Resolved", "Resolue"],
    ["Assign user", "Assigner un utilisateur"],
    ["Install Agent", "Installer l'agent"],
    ["Total Devices", "Total appareils"],
    ["Across all departments", "Sur tous les départements"],
    ["Online", "En ligne"],
    ["Offline", "Hors ligne"],
    ["Needs attention", "Necessite une action"],
    ["Servers", "Serveurs"],
    ["Workstations", "Postes"],
    ["SNMP Devices", "Appareils SNMP"],
    ["Install Agent on a New Device", "Installer l'agent sur un nouvel appareil"],
    ["Deploy the DiaTech monitoring agent via script, GPO, or installer package.", "Deployer l'agent de supervision DiaTech via script, GPO ou package d'installation."],
    ["Download Windows Agent", "Telecharger l'agent Windows"],
    ["Download Mac Agent", "Telecharger l'agent Mac"],
    ["Linux Script", "Script Linux"],
    ["All Devices", "Tous les appareils"],
    ["Acknowledged", "Acquitte"],
    ["Live", "En direct"],
    ["IT Inventory", "Inventaire TI"],
    ["Monthly budget exceeded", "Budget mensuel depasse"],
    ["Assets not assigned", "Actifs non assignes"],
    ["CPU Temperature Critical", "Temperature CPU critique"],
    ["VPN Tunnel Down", "Tunnel VPN hors service"],
    ["Disk Space Low (85%)", "Espace disque faible (85%)"],
    ["Network Switch Unresponsive", "Commutateur reseau non repondant"],
    ["Fan Speed Anomaly Detected", "Anomalie de vitesse ventilateur detectee"],
    ["Antivirus Definitions Outdated", "Definitions antivirus obsoletees"],
    ["New Device Connected", "Nouvel appareil connecte"],
    ["Windows Update Pending Reboot", "Mise a jour Windows en attente de redemarrage"],
    ["Agent Version Updated", "Version de l'agent mise a jour"],
    ["Info", "Info"],
    ["DiaTech - Tickets", "DiaTech - Tickets"],
    ["DiaTech - Devices", "DiaTech - Appareils"],
    ["DiaTech - Alerts", "DiaTech - Alertes"],
    ["DiaTech - Departments", "DiaTech - Départements"],
    ["DiaTech - Reports", "DiaTech - Rapports"],
    ["DiaTech - Inventory", "DiaTech - Inventaire"],
    ["DiaTech - Budget", "DiaTech - Budget"],
    ["DiaTech - IT Analytics", "DiaTech - Analytique TI"],
    ["DiaTech - Settings", "DiaTech - Parametres"],
  ];

  var fragmentPairs = [
    [" min ago", " min"],
    [" h ago", " h"],
    ["Only ", "Seulement "],
    [" asset(s)", " actif(s)"],
    ["in Purchase stage", "au stade Achat"],
    ["Minimum buffer is ", "Le stock minimum est "],
    ["Restock or receive hardware before new hires.", "Reapprovisionnez ou recevez du materiel avant les nouvelles embauches."],
    [" spent this month vs ", " depenses ce mois-ci vs "],
    [" cap (", " plafond ("],
    [" over).", " de depassement)."],
    ["active asset(s) have no owner", "actif(s) n'ont pas de proprietaire"],
    [" and ", " et "],
    [" more", " de plus"],
  ];

  function buildMaps() {
    var toFr = {};
    var toEn = {};
    exactPairs.forEach(function (p) {
      toFr[p[0]] = p[1];
      toEn[p[1]] = p[0];
    });
    return { fr: toFr, en: toEn };
  }

  var exactMaps = buildMaps();

  function getStoredLanguage() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (_) {
      return null;
    }
  }

  function getLanguage() {
    var stored = getStoredLanguage();
    if (stored && messages[stored]) return stored;
    return DEFAULT_LANG;
  }

  function t(key, fallback) {
    var lang = getLanguage();
    if (messages[lang] && Object.prototype.hasOwnProperty.call(messages[lang], key)) {
      return messages[lang][key];
    }
    if (messages[DEFAULT_LANG] && Object.prototype.hasOwnProperty.call(messages[DEFAULT_LANG], key)) {
      return messages[DEFAULT_LANG][key];
    }
    return fallback != null ? fallback : key;
  }

  function format(template, vars) {
    var s = String(template || "");
    if (!vars || typeof vars !== "object") return s;
    Object.keys(vars).forEach(function (k) {
      s = s.split("{" + k + "}").join(String(vars[k]));
    });
    return s;
  }

  /** Translate key then replace {placeholders} from vars. */
  function tf(key, vars, fallback) {
    return format(t(key, fallback != null ? fallback : key), vars);
  }

  function normalizeSpaces(input) {
    return String(input || "").replace(/\s+/g, " ").trim();
  }

  function translateLooseText(text, lang) {
    if (!text) return text;
    var trimmed = normalizeSpaces(text);
    if (!trimmed) return text;

    var exactMap = exactMaps[lang] || {};
    var exact = exactMap[trimmed];
    if (exact) {
      var leading = String(text).match(/^\s*/)[0] || "";
      var trailing = String(text).match(/\s*$/)[0] || "";
      return leading + exact + trailing;
    }

    var output = String(text);
    if (lang === "fr") {
      fragmentPairs.forEach(function (pair) {
        output = output.split(pair[0]).join(pair[1]);
      });
    } else {
      fragmentPairs.forEach(function (pair) {
        output = output.split(pair[1]).join(pair[0]);
      });
    }
    return output;
  }

  function autoTranslateAttributes(scope, lang) {
    scope.querySelectorAll("input[placeholder], textarea[placeholder]").forEach(function (el) {
      if (el.hasAttribute("data-i18n-placeholder")) return;
      var current = el.getAttribute("placeholder");
      var next = translateLooseText(current, lang);
      if (next !== current) el.setAttribute("placeholder", next);
    });
    scope.querySelectorAll("[title]").forEach(function (el) {
      if (el.hasAttribute("data-i18n-title")) return;
      var title = el.getAttribute("title");
      var nextTitle = translateLooseText(title, lang);
      if (nextTitle !== title) el.setAttribute("title", nextTitle);
    });
    scope.querySelectorAll("option").forEach(function (el) {
      if (el.hasAttribute("data-i18n")) return;
      var txt = el.textContent;
      var nextTxt = translateLooseText(txt, lang);
      if (nextTxt !== txt) el.textContent = nextTxt;
    });
  }

  function shouldSkipNode(node) {
    if (!node || !node.parentElement) return true;
    var tag = node.parentElement.tagName;
    if (!tag) return true;
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT" || tag === "CODE" || tag === "PRE" || tag === "TEXTAREA") {
      return true;
    }
    if (node.parentElement.closest("[data-i18n-ignore]")) return true;
    return false;
  }

  function autoTranslateTextNodes(scope, lang) {
    var walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, null);
    var node;
    while ((node = walker.nextNode())) {
      if (shouldSkipNode(node)) continue;
      var original = node.nodeValue;
      var translated = translateLooseText(original, lang);
      if (translated !== original) node.nodeValue = translated;
    }
  }

  function applyTranslations(root) {
    var scope = root || document;
    var lang = getLanguage();
    document.documentElement.lang = lang === "fr" ? "fr" : "en";

    scope.querySelectorAll("[data-i18n]").forEach(function (el) {
      var key = el.getAttribute("data-i18n");
      if (!key) return;
      el.textContent = t(key, el.textContent);
    });

    scope.querySelectorAll("[data-i18n-placeholder]").forEach(function (el) {
      var key = el.getAttribute("data-i18n-placeholder");
      if (!key) return;
      el.setAttribute("placeholder", t(key, el.getAttribute("placeholder") || ""));
    });

    scope.querySelectorAll("[data-i18n-title]").forEach(function (el) {
      var key = el.getAttribute("data-i18n-title");
      if (!key) return;
      el.setAttribute("title", t(key, el.getAttribute("title") || ""));
    });

    if (document.title) {
      document.title = translateLooseText(document.title, lang);
    }

    autoTranslateAttributes(scope, lang);
    autoTranslateTextNodes(scope, lang);
  }

  function scheduleApply() {
    if (rafToken) return;
    rafToken = global.requestAnimationFrame(function () {
      rafToken = 0;
      applyTranslations(document.body || document.documentElement);
    });
  }

  function startObserver() {
    if (observer || !global.MutationObserver || !document.body) return;
    observer = new MutationObserver(function () {
      scheduleApply();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["title", "placeholder"],
    });
  }

  function setLanguage(lang) {
    if (!messages[lang]) return;
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch (_) {}
    applyTranslations(document);
    global.dispatchEvent(new CustomEvent("i18n:change", { detail: { lang: lang } }));
  }

  function init() {
    applyTranslations(document);
    startObserver();
  }

  global.I18n = {
    getLanguage: getLanguage,
    setLanguage: setLanguage,
    applyTranslations: applyTranslations,
    t: t,
    format: format,
    tf: tf,
    languages: Object.keys(messages),
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(typeof window !== "undefined" ? window : this);
