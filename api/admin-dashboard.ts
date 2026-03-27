import { createClient } from '@supabase/supabase-js';

const ALLOWED_ADMIN_EMAILS = new Set(['digitalmerch4862@gmail.com']);

type DashboardRange = 'today' | '7d' | '30d' | 'mtd';

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

  return { ok: true as const };
};

const parseRange = (value: string): DashboardRange => {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'today' || normalized === '30d' || normalized === 'mtd') {
    return normalized;
  }
  return '7d';
};

const getRangeDates = (range: DashboardRange) => {
  const end = new Date();
  const start = new Date(end);
  start.setHours(0, 0, 0, 0);

  if (range === 'today') {
    return { startIso: start.toISOString(), endIso: end.toISOString() };
  }
  if (range === '7d') {
    start.setDate(start.getDate() - 6);
    return { startIso: start.toISOString(), endIso: end.toISOString() };
  }
  if (range === '30d') {
    start.setDate(start.getDate() - 29);
    return { startIso: start.toISOString(), endIso: end.toISOString() };
  }

  start.setDate(1);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
};

const toDayKey = (value: string | Date) => {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};

const getReviewStatus = (status: string): 'pending' | 'approved' | 'rejected' => {
  const lower = status.toLowerCase();
  if (lower.includes('review:approved')) return 'approved';
  if (lower.includes('review:rejected')) return 'rejected';
  return 'pending';
};

const normalizeProductName = (value: string) => value
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const createDateBuckets = (startIso: string, endIso: string) => {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const buckets: string[] = [];
  for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    buckets.push(toDayKey(cursor));
  }
  return buckets.filter(Boolean);
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

    const range = parseRange(String(req.query?.range ?? '7d'));
    const { startIso, endIso } = getRangeDates(range);

    const [visitsLookup, ordersLookup] = await Promise.all([
      supabase
        .from('analytics_visits')
        .select('created_at, page, session_id')
        .gte('created_at', startIso)
        .lte('created_at', endIso)
        .order('created_at', { ascending: true })
        .limit(20000),
      supabase
        .from('verification_orders')
        .select('created_at, email_status, total_amount, amount, products_json')
        .gte('created_at', startIso)
        .lte('created_at', endIso)
        .order('created_at', { ascending: true })
        .limit(10000),
    ]);

    if (visitsLookup.error) {
      return res.status(500).json({ ok: false, error: visitsLookup.error.message });
    }
    if (ordersLookup.error) {
      return res.status(500).json({ ok: false, error: ordersLookup.error.message });
    }

    const visits = visitsLookup.data ?? [];
    const orders = ordersLookup.data ?? [];

    const uniqueVisitorSet = new Set<string>();
    const sessionsCount = new Map<string, number>();
    const visitsByDayMap = new Map<string, number>();
    const topPagesMap = new Map<string, number>();

    for (const row of visits) {
      const sessionId = String((row as any).session_id ?? '').trim();
      const dayKey = toDayKey(String((row as any).created_at ?? ''));
      const page = String((row as any).page ?? '').trim() || '/';

      if (sessionId) {
        uniqueVisitorSet.add(sessionId);
        sessionsCount.set(sessionId, (sessionsCount.get(sessionId) ?? 0) + 1);
      }
      if (dayKey) {
        visitsByDayMap.set(dayKey, (visitsByDayMap.get(dayKey) ?? 0) + 1);
      }
      topPagesMap.set(page, (topPagesMap.get(page) ?? 0) + 1);
    }

    let ordersSubmitted = 0;
    let approvedPurchases = 0;
    let revenueApproved = 0;
    const purchasesByDayMap = new Map<string, number>();
    const statusCounts = { pending: 0, approved: 0, rejected: 0 };
    const topProductsMap = new Map<string, { product: string; count: number; revenue: number }>();

    for (const row of orders) {
      ordersSubmitted += 1;
      const status = getReviewStatus(String((row as any).email_status ?? ''));
      statusCounts[status] += 1;

      const amount = Number((row as any).total_amount ?? (row as any).amount ?? 0);
      const safeAmount = Number.isFinite(amount) ? amount : 0;
      const dayKey = toDayKey(String((row as any).created_at ?? ''));

      if (status === 'approved') {
        approvedPurchases += 1;
        revenueApproved += safeAmount;
        if (dayKey) {
          purchasesByDayMap.set(dayKey, (purchasesByDayMap.get(dayKey) ?? 0) + 1);
        }
      }

      const productsRaw = Array.isArray((row as any).products_json) ? (row as any).products_json : [];
      const names = productsRaw
        .map((item: any) => String(item?.name ?? '').trim())
        .filter(Boolean);
      if (names.length === 0) continue;

      const perProductRevenue = safeAmount > 0 ? safeAmount / names.length : 0;
      for (const name of names) {
        const key = normalizeProductName(name);
        const existing = topProductsMap.get(key);
        if (existing) {
          existing.count += 1;
          existing.revenue += perProductRevenue;
        } else {
          topProductsMap.set(key, { product: name, count: 1, revenue: perProductRevenue });
        }
      }
    }

    const uniqueVisitors = uniqueVisitorSet.size;
    const totalVisits = visits.length;
    const returningVisitors = Array.from(sessionsCount.values()).filter((value) => value > 1).length;
    const conversionRate = uniqueVisitors > 0 ? (approvedPurchases / uniqueVisitors) * 100 : 0;
    const avgOrderValue = approvedPurchases > 0 ? revenueApproved / approvedPurchases : 0;
    const returningVisitorRate = uniqueVisitors > 0 ? (returningVisitors / uniqueVisitors) * 100 : 0;

    const dayBuckets = createDateBuckets(startIso, endIso);
    const visitsByDay = dayBuckets.map((date) => ({ date, value: visitsByDayMap.get(date) ?? 0 }));
    const purchasesByDay = dayBuckets.map((date) => ({ date, value: purchasesByDayMap.get(date) ?? 0 }));

    const topPages = Array.from(topPagesMap.entries())
      .map(([page, pageVisits]) => ({ page, visits: pageVisits }))
      .sort((a, b) => b.visits - a.visits || a.page.localeCompare(b.page))
      .slice(0, 8);

    const topProducts = Array.from(topProductsMap.values())
      .sort((a, b) => b.count - a.count || b.revenue - a.revenue || a.product.localeCompare(b.product))
      .slice(0, 8)
      .map((item) => ({ ...item, revenue: Number(item.revenue.toFixed(2)) }));

    return res.status(200).json({
      ok: true,
      range,
      kpis: {
        uniqueVisitors,
        totalVisits,
        ordersSubmitted,
        approvedPurchases,
        conversionRate: Number(conversionRate.toFixed(2)),
        revenueApproved: Number(revenueApproved.toFixed(2)),
        avgOrderValue: Number(avgOrderValue.toFixed(2)),
        returningVisitorRate: Number(returningVisitorRate.toFixed(2)),
      },
      trends: {
        visitsByDay,
        purchasesByDay,
      },
      breakdowns: {
        topPages,
        topProducts,
        statusCounts,
      },
      funnel: {
        visited: uniqueVisitors,
        submitted: ordersSubmitted,
        approved: approvedPurchases,
      },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Unexpected server error' });
  }
}
