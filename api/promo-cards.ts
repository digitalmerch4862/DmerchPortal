import { createClient } from '@supabase/supabase-js';

const ALLOWED_ADMIN_EMAILS = new Set(['digitalmerch4862@gmail.com']);

const resolveCorsOrigin = (req: any) => {
  const appBase = process.env.APP_BASE_URL ?? 'https://paymentportal.digitalmerchs.store';
  const allowed = new Set([appBase, 'http://localhost:3000', 'http://127.0.0.1:3000']);
  const incoming = String(req.headers.origin ?? '').trim();
  return allowed.has(incoming) ? incoming : appBase;
};

const setCors = (req: any, res: any, methods: string) => {
  const origin = resolveCorsOrigin(req);
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

const getBearerToken = (req: any) => {
  const raw = String(req.headers.authorization ?? req.headers.Authorization ?? '').trim();
  if (!raw.toLowerCase().startsWith('bearer ')) return '';
  return raw.slice(7).trim();
};

const requireAdmin = async (req: any, supabase: any) => {
  const token = getBearerToken(req);
  if (!token) return { ok: false as const, status: 401, error: 'Missing bearer token.' };

  const userLookup = await supabase.auth.getUser(token);
  if (userLookup.error || !userLookup.data.user) {
    return { ok: false as const, status: 401, error: 'Invalid or expired admin session.' };
  }

  const adminEmail = String(userLookup.data.user.email ?? '').trim().toLowerCase();
  if (!ALLOWED_ADMIN_EMAILS.has(adminEmail)) {
    return { ok: false as const, status: 403, error: 'Admin account is not allowlisted.' };
  }
  return { ok: true as const };
};

const sanitizeCards = (raw: unknown) => {
  const arr = Array.isArray(raw) ? raw : [];
  return [0, 1, 2].map((i) => {
    const item = arr[i] && typeof arr[i] === 'object' ? (arr[i] as Record<string, unknown>) : {};
    return {
      slot: i + 1,
      title: String(item.title ?? `Promo Slot ${i + 1}`).trim() || `Promo Slot ${i + 1}`,
      image_url: String(item.imageUrl ?? item.image_url ?? '').trim(),
      href: String(item.href ?? '').trim(),
      updated_at: new Date().toISOString(),
    };
  });
};

export default async function handler(req: any, res: any) {
  setCors(req, res, 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return res.status(500).json({ ok: false, error: 'Missing server configuration.' });
  }
  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, { auth: { persistSession: false } });

  try {
    if (req.method === 'GET') {
      const lookup = await supabase.from('promo_cards').select('slot, title, image_url, href').order('slot', { ascending: true });
      if (lookup.error) return res.status(500).json({ ok: false, error: lookup.error.message });
      const rows = (lookup.data ?? []).map((r: any) => ({
        slot: Number(r.slot),
        title: String(r.title ?? ''),
        imageUrl: String(r.image_url ?? ''),
        href: String(r.href ?? ''),
      }));
      return res.status(200).json({ ok: true, cards: rows });
    }

    if (req.method === 'POST') {
      const authCheck = await requireAdmin(req, supabase);
      if (!authCheck.ok) return res.status(authCheck.status).json({ ok: false, error: authCheck.error });

      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {});
      const nextCards = sanitizeCards(body.cards);
      const upsert = await supabase.from('promo_cards').upsert(nextCards, { onConflict: 'slot' });
      if (upsert.error) return res.status(500).json({ ok: false, error: upsert.error.message });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Unexpected server error' });
  }
}
