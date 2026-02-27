import { createClient } from '@supabase/supabase-js';

const ALLOWED_ADMIN_EMAILS = new Set(['rad4862@gmail.com', 'digitalmerch4862@gmail.com']);

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
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

  const adminEmail = String(userLookup.data.user.email ?? '').trim().toLowerCase();
  if (!ALLOWED_ADMIN_EMAILS.has(adminEmail)) {
    return { ok: false as const, status: 403, error: 'Admin account is not allowlisted.' };
  }

  return { ok: true as const, user: userLookup.data.user };
};

const getReviewStatus = (status: string): 'pending' | 'approved' | 'rejected' => {
  const lower = status.toLowerCase();
  if (lower.includes('review:approved')) {
    return 'approved';
  }
  if (lower.includes('review:rejected')) {
    return 'rejected';
  }
  return 'pending';
};

export default async function handler(req: any, res: any) {
  setCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
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
      .select('serial_no, username, email, created_at, products_json, total_amount, amount, email_status')
      .order('created_at', { ascending: false })
      .limit(5000);

    if (lookup.error) {
      return res.status(500).json({ ok: false, error: lookup.error.message });
    }

    const rows = (lookup.data ?? []).map((row) => {
      const products = Array.isArray(row.products_json) ? row.products_json : [];
      const productNames = products
        .map((item: any) => String(item?.name ?? '').trim())
        .filter(Boolean);

      return {
        referenceCode: row.serial_no,
        buyerName: row.username,
        buyerEmail: row.email,
        submittedAt: row.created_at,
        products: productNames,
        totalAmount: Number(row.total_amount ?? row.amount ?? 0),
        status: getReviewStatus(String(row.email_status ?? '')),
      };
    });

    return res.status(200).json({ ok: true, rows });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Unexpected server error' });
  }
}
