/**
 * Supabase Auth + lecture du rôle (table public.profiles).
 * Chargé en dynamic import depuis auth.js (même dossier que les pages HTML).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const VALID_ROLES = new Set(["admin", "agent", "user"]);

export function isSupabaseConfigured() {
  const p = typeof window !== "undefined" ? window.__DIATECH_PUBLIC__ : null;
  return Boolean(
    p && String(p.supabaseUrl || "").trim() && String(p.supabaseAnonKey || "").trim()
  );
}

export function getClient() {
  const p = window.__DIATECH_PUBLIC__;
  return createClient(String(p.supabaseUrl).trim(), String(p.supabaseAnonKey).trim(), {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: typeof localStorage !== "undefined" ? localStorage : undefined,
    },
  });
}

export function normalizeProfileRole(r) {
  const v = String(r || "user").toLowerCase();
  return VALID_ROLES.has(v) ? v : "user";
}

function clearSupabaseSessionFields() {
  if (typeof DB === "undefined" || !DB.session) return;
  if (DB.session.authProvider !== "supabase") return;
  DB.session.authProvider = null;
  DB.session.profileRole = null;
  DB.session.supabaseUserId = null;
  DB.session.supabaseEmail = null;
  DB.session.supabaseDisplayName = null;
  DB.session.profileActive = true;
  DB.session.profileAppAccess = null;
  DB.session.isAuthenticated = false;
  DB.session.currentUserId = null;
}

export async function hydrateFromSupabase() {
  if (!isSupabaseConfigured()) return;

  const supabase = getClient();
  window.__diaTechSupabaseClient = supabase;

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    clearSupabaseSessionFields();
    window.currentUserRole = undefined;
    return;
  }

  const uid = session.user.id;
  const email = (session.user.email || "").trim();

  let profile = null;
  let profileError = null;
  const full = await supabase
    .from("profiles")
    .select("role,active,display_name,app_access")
    .eq("id", uid)
    .maybeSingle();
  if (full.error) {
    profileError = full.error;
    const minimal = await supabase.from("profiles").select("role").eq("id", uid).maybeSingle();
    if (minimal.error) {
      console.warn("[DiaTech] profiles read:", profileError.message);
    } else {
      profile = minimal.data;
      console.warn(
        "[DiaTech] profiles: run schema_profiles_app_access.sql for full access control (active, app_access)."
      );
    }
  } else {
    profile = full.data;
  }

  if (profile && profile.active === false) {
    await supabase.auth.signOut();
    clearSupabaseSessionFields();
    window.currentUserRole = undefined;
    return;
  }

  const role = normalizeProfileRole(profile?.role);
  window.currentUserRole = role;

  const { data: aalGate, error: aalGateErr } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (!aalGateErr && aalGate?.currentLevel === "aal1" && aalGate?.nextLevel === "aal2") {
    const page = (window.location.pathname || "").split("/").pop().toLowerCase();
    if (page !== "mfa-verify.html" && page !== "login.html") {
      window.location.replace(
        "mfa-verify.html?return=" + encodeURIComponent(page || "index.html")
      );
      return;
    }
  }

  if (role === "admin" && window.__DIATECH_PUBLIC__?.requireAdminMfa) {
    try {
      const { data: fd, error: fdErr } = await supabase.auth.mfa.listFactors();
      if (!fdErr && fd?.all) {
        const verified = fd.all.filter((f) => f.status === "verified");
        if (verified.length === 0) {
          const page = (window.location.pathname || "").split("/").pop().toLowerCase();
          const allow = ["mfa-enroll.html", "mfa-verify.html", "login.html"];
          if (!allow.includes(page)) {
            window.location.replace(
              "mfa-enroll.html?return=" + encodeURIComponent(page || "index.html")
            );
            return;
          }
        }
      }
    } catch (_e) {
      /* MFA non disponible côté projet — ne pas bloquer */
    }
  }

  const emailLower = email.toLowerCase();
  const linked =
    typeof DB !== "undefined" && Array.isArray(DB.users)
      ? DB.users.find((u) => String(u.email || "").toLowerCase() === emailLower)
      : null;

  if (typeof setSessionUser === "function" && typeof clearSession === "function") {
    if (linked) {
      setSessionUser(linked.id);
    } else {
      clearSession();
    }
  }

  DB.session.authProvider = "supabase";
  DB.session.profileRole = role;
  DB.session.supabaseUserId = uid;
  DB.session.supabaseEmail = email;
  DB.session.profileActive = profile?.active !== false;
  DB.session.profileAppAccess =
    profile?.app_access && typeof profile.app_access === "object" && !Array.isArray(profile.app_access)
      ? profile.app_access
      : null;
  DB.session.supabaseDisplayName =
    (profile?.display_name && String(profile.display_name).trim()) ||
    session.user.user_metadata?.full_name ||
    session.user.user_metadata?.name ||
    email.split("@")[0] ||
    "User";
  DB.session.isAuthenticated = true;

  try {
    localStorage.removeItem("nexusops_session_v1");
  } catch (_e) {
    /* ignore */
  }

  // Sidebar / nav : après hydratation, ré-appliquer les droits (souvent après le 1er enhanceUI ou avant le DOM).
  const runEnhance = () => {
    try {
      if (typeof Auth !== "undefined" && typeof Auth.enhanceUI === "function") Auth.enhanceUI();
    } catch (_e) {
      /* ignore */
    }
  };
  requestAnimationFrame(() => requestAnimationFrame(runEnhance));
}

export async function signInWithSupabase(email, password) {
  if (!isSupabaseConfigured()) return { ok: false, error: "not_configured" };
  const supabase = getClient();
  window.__diaTechSupabaseClient = supabase;
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: error.message };
  const { data: aalData, error: aalErr } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (!aalErr && aalData?.currentLevel === "aal1" && aalData?.nextLevel === "aal2") {
    return { ok: true, needsMfaChallenge: true };
  }
  await hydrateFromSupabase();
  return { ok: true };
}

export async function signOutSupabase() {
  try {
    if (window.__diaTechSupabaseClient?.auth) {
      await window.__diaTechSupabaseClient.auth.signOut();
    }
  } catch (_e) {
    /* ignore */
  }
  window.__diaTechSupabaseClient = null;
  window.currentUserRole = undefined;
  clearSupabaseSessionFields();
}
