/**
 * Configuration publique front (clé anon / publishable — jamais la service_role).
 * Surcharge possible : définir window.__DIATECH_PUBLIC__ avant ce script.
 *
 * Si la connexion Supabase échoue avec une erreur de clé, utilisez la clé
 * « anon » / « legacy » JWT (eyJ…) depuis Supabase → Settings → API.
 */
window.__DIATECH_PUBLIC__ = Object.assign(
  {
    supabaseUrl: "https://ungcuuhewgqiamecetxx.supabase.co",
    supabaseAnonKey: "sb_publishable_FAl1LiH0ksVeFYTF9tt9PQ_qYh-r6a6",
  },
  window.__DIATECH_PUBLIC__ || {}
);
