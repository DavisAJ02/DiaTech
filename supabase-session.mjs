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

function getClient() {
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

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", uid)
    .maybeSingle();

  if (profileError) {
    console.warn("[DiaTech] profiles read:", profileError.message);
  }

  const role = normalizeProfileRole(profile?.role);
  window.currentUserRole = role;

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
  DB.session.supabaseDisplayName =
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
}

export async function signInWithSupabase(email, password) {
  if (!isSupabaseConfigured()) return { ok: false, error: "not_configured" };
  const supabase = getClient();
  window.__diaTechSupabaseClient = supabase;
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: error.message };
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
