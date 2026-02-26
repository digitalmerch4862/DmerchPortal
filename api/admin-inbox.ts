import { createClient } from '@supabase/supabase-js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-User, X-Admin-Key',
};

const isAdmin = (req: any) => {
  const user = String(req.headers['x-admin-user'] ?? '').trim().toUpperCase();
  const key = String(req.headers['x-admin-key'] ?? '').trim().toUpperCase();
  return user === 'RAD' && key === 'DMERCHPAYMENTPORTAL';
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
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
    res.setHeader('Access-Control-Allow-Methods', corsHeaders['Access-Control-Allow-Methods']);
    res.setHeader('Access-Control-Allow-Headers', corsHeaders['Access-Control-Allow-Headers']);
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed.' });
  }

  if (!isAdmin(req)) {
    return res.status(401).json({ ok: false, error: 'Unauthorized admin request.' });
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

    const lookup = await supabase
      .from('verification_orders')
      .select('serial_no, username, email, created_at, products_json, email_status, payment_portal_used, payment_detail_used')
      .order('created_at', { ascending: false })
      .limit(120);

    if (lookup.error) {
      return res.status(500).json({ ok: false, error: lookup.error.message });
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
          entitlementMap.set(String(row.email ?? '').trim().toLowerCase(), {
            download_used: Number((row as any).download_used ?? 0),
            download_limit: Number((row as any).download_limit ?? 10),
            is_unlimited: Boolean((row as any).is_unlimited),
          });
        }
      }
    }

    const inbox = (lookup.data ?? []).map((row) => {
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
      };
    });

    res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
    return res.status(200).json({ ok: true, inbox });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Unexpected server error' });
  }
}
