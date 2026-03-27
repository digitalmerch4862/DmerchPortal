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

const isArchivedInboxStatus = (status: string) => status.toLowerCase().includes('inbox:archived');

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

const archiveTag = 'inbox:archived';

async function handleGetInbox(req: any, res: any, supabase: any) {
  const authCheck = await requireAdmin(req, supabase);
  if (!authCheck.ok) {
    return res.status(authCheck.status).json({ ok: false, error: authCheck.error });
  }

  const lookup = await supabase
    .from('verification_orders')
    .select('serial_no, username, email, created_at, products_json, email_status, payment_portal_used, payment_detail_used')
    .not('email_status', 'ilike', '%inbox:archived%')
    .order('created_at', { ascending: false })
    .limit(120);

  if (lookup.error) {
    return res.status(500).json({ ok: false, error: lookup.error.message });
  }

  const productsLookup = await supabase
    .from('products')
    .select('name, file_url')
    .order('name')
    .limit(10000);

  const productUrlMap = new Map<string, string>();
  if (!productsLookup.error && productsLookup.data) {
    for (const p of productsLookup.data) {
      const key = String(p.name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
      if (key && p.file_url) {
        productUrlMap.set(key, String(p.file_url));
      }
    }
  }

  const emails = Array.from(new Set((lookup.data ?? []).map((row) => String(row.email ?? '').trim().toLowerCase()).filter(Boolean)));
  const entitlementMap = new Map<string, { download_used: number; download_limit: number; is_unlimited: boolean }>();

  if (emails.length > 0) {
    const entitlements = await supabase
      .from('buyer_entitlements')
      .select('email, download_used, download_limit, is_unlimited')
      .in('email', emails);

    if (!entitlements.error) {
      for (const row of entitlements.data ?? []) {
        entitlementMap.set(String((row as any).email ?? '').trim().toLowerCase(), {
          download_used: Number((row as any).download_used ?? 0),
          download_limit: Number((row as any).download_limit ?? 10),
          is_unlimited: Boolean((row as any).is_unlimited),
        });
      }
    }
  }

  const inbox = (lookup.data ?? [])
    .filter((row) => {
      const statusValue = String(row.email_status ?? '');
      return !isArchivedInboxStatus(statusValue) && getReviewStatus(statusValue) === 'pending';
    })
    .map((row) => {
      const products = Array.isArray(row.products_json) ? row.products_json : [];
      const totalDownloads = products.reduce((sum: number, item: any) => sum + Number(item.downloadCount ?? 0), 0);
      const entitlement = entitlementMap.get(String(row.email ?? '').trim().toLowerCase());
      return {
        referenceCode: row.serial_no,
        buyerName: row.username,
        buyerEmail: row.email,
        submittedAt: row.created_at,
        products: products.map((item: any) => String(item?.name ?? '')).filter(Boolean),
        status: getReviewStatus(String(row.email_status ?? '')),
        paymentPortalUsed: row.payment_portal_used,
        paymentDetailUsed: row.payment_detail_used,
        totalDownloads,
        entitlementUsed: entitlement?.download_used ?? 0,
        entitlementLimit: entitlement?.download_limit ?? 10,
        entitlementUnlimited: entitlement?.is_unlimited ?? false,
        deliveryLinksByProduct: products.reduce((acc: any, item: any) => {
          const name = String(item?.name ?? '').trim();
          const key = name.toLowerCase().replace(/\s+/g, ' ');
          let url = productUrlMap.get(key);
          if (!url && typeof item?.fileLink === 'string' && item.fileLink.trim() !== '') {
            url = item.fileLink.trim();
          }
          if (url) {
            acc[name] = url;
          }
          return acc;
        }, {}),
      };
    });

  return res.status(200).json({ ok: true, inbox });
}

async function handleClearInbox(req: any, res: any, supabase: any) {
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
}

export default async function handler(req: any, res: any) {
  const path = req.query?.path ?? '';

  if (path === 'clear') {
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

    if (path === 'clear') {
      if (req.method !== 'POST') {
        return res.status(405).json({ ok: false, error: 'Method not allowed.' });
      }
      return handleClearInbox(req, res, supabase);
    }

    if (req.method !== 'GET') {
      return res.status(405).json({ ok: false, error: 'Method not allowed.' });
    }

    return handleGetInbox(req, res, supabase);
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Unexpected server error' });
  }
}
