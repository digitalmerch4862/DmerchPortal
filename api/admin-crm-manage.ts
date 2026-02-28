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

  const adminEmail = String(userLookup.data.user.email ?? '').trim().toLowerCase();
  if (!ALLOWED_ADMIN_EMAILS.has(adminEmail)) {
    return { ok: false as const, status: 403, error: 'Admin account is not allowlisted.' };
  }

  return { ok: true as const, user: userLookup.data.user };
};

const readBody = async (req: any) => {
  if (typeof req.body === 'string') {
    return JSON.parse(req.body);
  }
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }
  return {};
};

const appendStatusTag = (currentStatus: string, tag: string) => {
  const parts = String(currentStatus ?? '')
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.includes(tag)) {
    parts.push(tag);
  }
  return parts.join(' | ');
};

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

    const body = await readBody(req);
    const serialNo = String(body.serialNo ?? '').trim().toUpperCase();
    const action = String(body.action ?? '').trim().toLowerCase();

    if (!serialNo || !action) {
      return res.status(400).json({ ok: false, error: 'serialNo and action are required.' });
    }

    const lookup = await supabase
      .from('verification_orders')
      .select('id, email_status')
      .eq('serial_no', serialNo)
      .single();

    if (lookup.error || !lookup.data) {
      return res.status(404).json({ ok: false, error: 'Order not found.' });
    }

    if (action === 'archive') {
      const nextStatus = appendStatusTag(String(lookup.data.email_status ?? ''), 'crm:archived');
      const archiveUpdate = await supabase
        .from('verification_orders')
        .update({ email_status: nextStatus })
        .eq('id', lookup.data.id);

      if (archiveUpdate.error) {
        return res.status(500).json({ ok: false, error: archiveUpdate.error.message });
      }

      return res.status(200).json({ ok: true, action: 'archive' });
    }

    if (action !== 'edit') {
      return res.status(400).json({ ok: false, error: 'Unsupported action.' });
    }

    const buyerName = String(body.buyerName ?? '').trim();
    const buyerEmail = String(body.buyerEmail ?? '').trim().toLowerCase();
    const totalAmount = Number(body.totalAmount ?? 0);
    const productsRaw = Array.isArray(body.products) ? body.products : [];
    const products = productsRaw.map((item: unknown) => String(item ?? '').trim()).filter(Boolean);

    if (!buyerName || !buyerEmail || !Number.isFinite(totalAmount) || totalAmount <= 0 || products.length === 0) {
      return res.status(400).json({ ok: false, error: 'buyerName, buyerEmail, products, and totalAmount are required.' });
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(buyerEmail)) {
      return res.status(400).json({ ok: false, error: 'Invalid buyer email address.' });
    }

    const perProductAmount = Number((totalAmount / products.length).toFixed(2));
    const productsJson = products.map((name) => ({ name, amount: perProductAmount }));

    const editUpdate = await supabase
      .from('verification_orders')
      .update({
        username: buyerName,
        email: buyerEmail,
        product_name: products[0],
        amount: totalAmount,
        total_amount: totalAmount,
        products_json: productsJson,
      })
      .eq('id', lookup.data.id);

    if (editUpdate.error) {
      return res.status(500).json({ ok: false, error: editUpdate.error.message });
    }

    return res.status(200).json({ ok: true, action: 'edit' });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Unexpected server error' });
  }
}
