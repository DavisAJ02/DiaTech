/**
 * Crée un utilisateur Supabase Auth et fixe public.profiles.role (service role).
 * Usage : node scripts/supabase-create-user.mjs <email> <motDePasse> [role]
 * role : admin | agent | user (défaut : admin)
 * Lit SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY depuis .env.local ou l’environnement.
 *
 * La clé doit être la secret **service_role** (JWT eyJ…) : Dashboard → Project Settings → API.
 * Les préfixes sb_secret_ / sb_publishable_ peuvent être refusés par l’API Admin selon le projet.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

function parseEnvFile(content) {
  const out = {};
  for (const line of content.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    val = val.replace(/\r/g, '').replace(/\n/g, '').trim();
    out[key] = val;
  }
  return out;
}

function loadEnv() {
  const p = join(process.cwd(), '.env.local');
  if (existsSync(p)) {
    Object.assign(process.env, parseEnvFile(readFileSync(p, 'utf8')));
  }
}

loadEnv();

function cleanSupabaseUrl(raw) {
  if (!raw) return '';
  let u = String(raw).replace(/\r/g, '').replace(/\n/g, '').trim();
  u = u.replace(/\\r\\n$/g, '').replace(/\\n$/g, '').replace(/\\r$/g, '').trim();
  const m = u.match(/^https:\/\/[a-z0-9.-]+\.supabase\.co/i);
  return m ? m[0] : u;
}

const url =
  cleanSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL) ||
  cleanSupabaseUrl(process.env.SUPABASE_URL);
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.replace(/\r/g, '').trim();

const [,, email, password, roleArg = 'admin'] = process.argv;
const role = ['admin', 'agent', 'user'].includes(roleArg) ? roleArg : 'admin';

if (!url || !serviceKey) {
  console.error('Manque SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY (.env.local ou env).');
  process.exit(1);
}
if (!email || !password) {
  console.error('Usage: node scripts/supabase-create-user.mjs <email> <motDePasse> [admin|agent|user]');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findUserIdByEmail(target) {
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const u = data.users.find((x) => x.email?.toLowerCase() === target.toLowerCase());
    if (u) return u.id;
    if (data.users.length < perPage) break;
    page += 1;
  }
  return null;
}

async function main() {
  let userId = null;

  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createErr) {
    const msg = String(createErr.message || '');
    if (msg.includes('Invalid API key') || createErr.status === 401) {
      console.error(
        'Clé API refusée : utilisez la secret service_role (JWT eyJ…) dans SUPABASE_SERVICE_ROLE_KEY, pas la clé anon/publishable.'
      );
      process.exit(1);
    }
    if (!msg.toLowerCase().includes('already')) {
      console.error(createErr);
      process.exit(1);
    }
    userId = await findUserIdByEmail(email);
    if (!userId) {
      console.error('Utilisateur existe mais introuvable par email.');
      process.exit(1);
    }
    const { error: updErr } = await supabase.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
    });
    if (updErr) {
      console.error('Mise à jour mot de passe:', updErr.message);
    } else {
      console.log('Compte existant : mot de passe mis à jour.');
    }
  } else {
    userId = created.user.id;
    console.log('Utilisateur Auth créé.');
  }

  const { error: profErr } = await supabase.from('profiles').upsert(
    { id: userId, role },
    { onConflict: 'id' }
  );
  if (profErr) {
    console.error('profiles:', profErr.message);
    process.exit(1);
  }

  console.log('OK — email:', email, '| role:', role);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
