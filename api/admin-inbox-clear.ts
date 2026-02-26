import { createClient } from '@supabase/supabase-js';

const resolveCorsOrigin = (req: any) => {
  const appBase = process.env.APP_BASE_URL ?? 'https://paymentportal.digitalmerchs.store';
  const allowed = new Set([appBase, 'http://localhost:3000', 'http://127.0.0.1:3000']);
  const incoming = String(req.headers.origin ?? '').trim();
  return allowed.has(incoming) ? incoming : appBase;
};

const setCors = (req: any, res: any) => {
  const origin = resolveCorsOrigin(req);
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

const getBearerToken = (req: any) => {
  const raw = String(req.headers.authorization ?? req.headers.Authorization ?? '').trim();
  if (!raw.toLowerCase().startsWith('bearer ')) {
    return '';
  }
  return raw.slice(7).trim();
};

const requireAdmin = async (req: any, supabase: any) => {
  const token = getBearerToken(req);
  if (!token) {
    return { ok: false as const, status: 401, error: 'Missing bearer token.' };
  }

  const userLookup = await supabase.auth.getUser(token);
  if (userLookup.error || !userLookup.data.user) {
    return { ok: false as const, status: 401, error: 'Invalid or expired admin session.' };
  }

  const roleLookup = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userLookup.data.user.id)
    .eq('role', 'admin')
    .maybeSingle();

  if (roleLookup.error || !roleLookup.data) {
    return { ok: false as const, status: 403, error: 'Admin role required.' };
  }

  return { ok: true as const, user: userLookup.data.user };
};

const archiveTag = 'inbox:archived';

export default async function handler(req: any, res: any) {
  setCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed.' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return res.status(500).json({ ok: false, error: 'Missing server configuration.' });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const authCheck = await requireAdmin(req, supabase);
    if (!authCheck.ok) {
      return res.status(authCheck.status).json({ ok: false, error: authCheck.error });
    }

    const lookup = await supabase
      .from('verification_orders')
      .select('id, email_status')
      .not('email_status', 'ilike', `%${archiveTag}%`)
      .order('created_at', { ascending: false })
      .limit(2000);

    if (lookup.error) {
      return res.status(500).json({ ok: false, error: lookup.error.message });
    }

    const targets = lookup.data ?? [];
    if (targets.length === 0) {
      return res.status(200).json({ ok: true, archivedCount: 0 });
    }

    await Promise.all(
      targets.map((row) => {
        const current = String(row.email_status ?? '').trim();
        const next = current ? `${current} | ${archiveTag}` : archiveTag;
        return supabase
          .from('verification_orders')
          .update({ email_status: next })
          .eq('id', row.id);
      }),
    );

    return res.status(200).json({ ok: true, archivedCount: targets.length });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Unexpected server error' });
  }
}
