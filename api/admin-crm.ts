import { createClient } from '@supabase/supabase-js';

const ALLOWED_ADMIN_EMAILS = new Set(['digitalmerch4862@gmail.com']);

const resolveCorsOrigin = (req: any) => {
  const appBase = process.env.APP_BASE_URL ?? 'https://dmerchportal.digitalmerchs.store';
  const allowed = new Set([appBase, 'http://localhost:3000', 'http://127.0.0.1:3000']);
  const incoming = String(req.headers.origin ?? '').trim();
  return allowed.has(incoming) ? incoming : appBase;
};

const setCors = (req: any, res: any, methods: string = 'GET, OPTIONS') => {
  const origin = resolveCorsOrigin(req);
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', methods);
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

const isArchivedCrmStatus = (status: string) => status.toLowerCase().includes('crm:archived');

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

const replaceReviewStatus = (currentStatus: string, nextTag: string) => {
  const parts = String(currentStatus ?? '')
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !part.toLowerCase().startsWith('review:'));
  if (!parts.includes(nextTag)) {
    parts.push(nextTag);
  }
  return parts.join(' | ');
};

async function handleGetCrm(req: any, res: any, supabase: any) {
  const authCheck = await requireAdmin(req, supabase);
  if (!authCheck.ok) {
    return res.status(authCheck.status).json({ ok: false, error: authCheck.error });
  }

  const lookup = await supabase
    .from('verification_orders')
    .select('serial_no, username, email, created_at, products_json, total_amount, amount, email_status')
    .not('email_status', 'ilike', '%crm:archived%')
    .order('created_at', { ascending: false })
    .limit(5000);

  if (lookup.error) {
    return res.status(500).json({ ok: false, error: lookup.error.message });
  }

  const rows = (lookup.data ?? [])
    .filter((row) => !isArchivedCrmStatus(String(row.email_status ?? '')))
    .map((row) => {
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
}

async function handleManageCrm(req: any, res: any, supabase: any) {
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

  if (action === 'approve' || action === 'reject') {
    const tag = action === 'approve' ? 'review:approved' : 'review:rejected';
    const nextStatus = replaceReviewStatus(String(lookup.data.email_status ?? ''), tag);
    const statusUpdate = await supabase
      .from('verification_orders')
      .update({ email_status: nextStatus })
      .eq('id', lookup.data.id);

    if (statusUpdate.error) {
      return res.status(500).json({ ok: false, error: statusUpdate.error.message });
    }

    return res.status(200).json({ ok: true, action });
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
}

async function handleBulkCrm(req: any, res: any, supabase: any) {
  const authCheck = await requireAdmin(req, supabase);
  if (!authCheck.ok) {
    return res.status(authCheck.status).json({ ok: false, error: authCheck.error });
  }

  const body = await readBody(req);
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (!rows.length) {
    return res.status(400).json({ ok: false, error: 'Rows are required.' });
  }

  const mapped = rows.map((row: any) => {
    const serialNo = String(row.serialNo ?? '').trim().toUpperCase();
    const buyerName = String(row.buyerName ?? '').trim();
    const buyerEmail = String(row.buyerEmail ?? '').trim().toLowerCase();
    const products = Array.isArray(row.products) ? row.products.map((item: any) => String(item ?? '').trim()).filter(Boolean) : [];
    const totalAmount = Number(row.totalAmount ?? 0);
    const statusRaw = String(row.status ?? '').trim().toLowerCase();
    const submittedAt = String(row.submittedAt ?? '').trim();

    const statusTag = statusRaw === 'approved'
      ? 'review:approved'
      : statusRaw === 'rejected'
        ? 'review:rejected'
        : 'review:pending';

    const perProductAmount = products.length > 0 ? Number((totalAmount / products.length).toFixed(2)) : 0;
    const productsJson = products.map((name) => ({ name, amount: perProductAmount }));

    return {
      serial_no: serialNo,
      username: buyerName,
      email: buyerEmail,
      product_name: products[0] ?? '',
      amount: totalAmount,
      total_amount: totalAmount,
      products_json: productsJson,
      email_status: statusTag,
      created_at: submittedAt || new Date().toISOString(),
    };
  }).filter((row: any) => row.serial_no && row.email && row.product_name && Number.isFinite(row.total_amount));

  if (!mapped.length) {
    return res.status(400).json({ ok: false, error: 'No valid rows to import.' });
  }

  const upsert = await supabase
    .from('verification_orders')
    .upsert(mapped, { onConflict: 'serial_no' });

  if (upsert.error) {
    return res.status(500).json({ ok: false, error: upsert.error.message });
  }

  return res.status(200).json({ ok: true, inserted: mapped.length });
}

export default async function handler(req: any, res: any) {
  const path = req.query?.path ?? '';

  if (path === 'manage' || path === 'bulk') {
    setCors(req, res, 'POST, OPTIONS');
  } else {
    setCors(req, res, 'GET, OPTIONS');
  }

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
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

    if (path === 'manage') {
      if (req.method !== 'POST') {
        return res.status(405).json({ ok: false, error: 'Method not allowed.' });
      }
      return handleManageCrm(req, res, supabase);
    }

    if (path === 'bulk') {
      if (req.method !== 'POST') {
        return res.status(405).json({ ok: false, error: 'Method not allowed.' });
      }
      return handleBulkCrm(req, res, supabase);
    }

    if (req.method !== 'GET') {
      return res.status(405).json({ ok: false, error: 'Method not allowed.' });
    }

    return handleGetCrm(req, res, supabase);
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Unexpected server error' });
  }
}
