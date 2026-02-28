import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

type OrderProduct = {
  name: string;
  amount: number;
  os?: string;
  fileLink?: string;
};

type BuyerEntitlement = {
  email: string;
  approved_product_count: number;
  download_used: number;
  download_limit: number;
  is_unlimited: boolean;
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

const decodeToken = (token: string, secret: string) => {
  const [payload, signature] = token.split('.');
  if (!payload || !signature) {
    return null;
  }
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  if (expected !== signature) {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { email: string; serialNo: string };
  } catch {
    return null;
  }
};

const isApprovedStatus = (status: string) => status.toLowerCase().includes('review:approved');

const toDirectDownloadLink = (url: string) => {
  if (!url.includes('drive.google.com')) return url;

  // Match /file/d/ID/view or /file/d/ID
  const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return `https://drive.google.com/uc?export=download&id=${match[1]}&confirm=t`;
  }
  return url;
};

const aggregateApprovedProducts = (rows: Array<{ products_json: unknown; serial_no: string }>) => {
  const byKey = new Map<string, { name: string; amount: number; os?: string; fileLink?: string; serialNo: string }>();
  for (const row of rows) {
    const products = Array.isArray(row.products_json) ? (row.products_json as OrderProduct[]) : [];
    for (const product of products) {
      const name = String(product.name ?? '').trim();
      if (!name) {
        continue;
      }
      const key = name.toLowerCase();
      const existing = byKey.get(key);
      const nextLink = String(product.fileLink ?? '').trim();

      if (!existing) {
        byKey.set(key, {
          name,
          amount: Number(product.amount ?? 0),
          os: product.os,
          fileLink: nextLink,
          serialNo: row.serial_no,
        });
        continue;
      }

      if (!existing.fileLink && nextLink) {
        byKey.set(key, {
          ...existing,
          fileLink: nextLink,
          serialNo: row.serial_no,
        });
      }
    }
  }

  return Array.from(byKey.values());
};

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
    res.setHeader('Access-Control-Allow-Methods', corsHeaders['Access-Control-Allow-Methods']);
    res.setHeader('Access-Control-Allow-Headers', corsHeaders['Access-Control-Allow-Headers']);
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed.' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const tokenSecret = process.env.DELIVERY_TOKEN_SECRET ?? supabaseServiceRoleKey;

  if (!supabaseUrl || !supabaseServiceRoleKey || !tokenSecret) {
    return res.status(500).json({ ok: false, error: 'Missing server configuration.' });
  }

  try {
    const body = await readBody(req);
    const token = String(body.token ?? '').trim();
    const productName = String(body.productName ?? '').trim();

    if (!token || !productName) {
      return res.status(400).json({ ok: false, error: 'Token and productName are required.' });
    }

    const tokenPayload = decodeToken(token, tokenSecret);
    if (!tokenPayload) {
      return res.status(401).json({ ok: false, error: 'Invalid token.' });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const orderLookup = await supabase
      .from('verification_orders')
      .select('id, serial_no, email, email_status')
      .eq('serial_no', tokenPayload.serialNo)
      .ilike('email', tokenPayload.email)
      .single();

    if (orderLookup.error || !orderLookup.data) {
      return res.status(404).json({ ok: false, error: 'Order not found.' });
    }

    const status = String(orderLookup.data.email_status ?? '');
    if (!isApprovedStatus(status)) {
      return res.status(403).json({ ok: false, error: 'Order is not approved yet.' });
    }

    const approvedOrders = await supabase
      .from('verification_orders')
      .select('serial_no, products_json, email_status')
      .eq('email', tokenPayload.email)
      .ilike('email_status', '%review:approved%')
      .order('created_at', { ascending: false })
      .limit(300);

    if (approvedOrders.error) {
      return res.status(500).json({ ok: false, error: approvedOrders.error.message });
    }

    const approvedRows = (approvedOrders.data ?? []).filter((row) => isApprovedStatus(String(row.email_status ?? '')));
    const products = aggregateApprovedProducts(approvedRows);

    const entitlementLookup = await supabase
      .from('buyer_entitlements')
      .select('email, approved_product_count, download_used, download_limit, is_unlimited')
      .eq('email', tokenPayload.email)
      .single();

    const entitlement: BuyerEntitlement = entitlementLookup.data ?? {
      email: tokenPayload.email,
      approved_product_count: 0,
      download_used: 0,
      download_limit: 10,
      is_unlimited: false,
    };

    const used = Number(entitlement.download_used ?? 0);
    const limit = Number(entitlement.download_limit ?? 10);
    if (!entitlement.is_unlimited && used >= limit) {
      return res.status(403).json({ ok: false, error: 'Download limit reached. Please contact support.', code: 'DOWNLOAD_LIMIT_REACHED' });
    }

    const target = products.find((item) => item.name === productName);
    if (!target) {
      return res.status(404).json({ ok: false, error: 'Selected product is not mapped for this order.' });
    }

    const targetLink = String(target.fileLink ?? '').trim();
    if (!targetLink) {
      return res.status(400).json({ ok: false, error: 'No delivery link configured yet for this product.' });
    }

    if (!entitlement.is_unlimited) {
      const nextUsed = used + 1;
      await supabase
        .from('buyer_entitlements')
        .upsert({
          email: tokenPayload.email,
          approved_product_count: Number(entitlement.approved_product_count ?? 0),
          download_used: nextUsed,
          download_limit: limit,
          is_unlimited: false,
        }, { onConflict: 'email' });
    }

    const nextUsed = entitlement.is_unlimited ? used : used + 1;

    res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
    return res.status(200).json({
      ok: true,
      redirectUrl: toDirectDownloadLink(targetLink),
      products: products.map((item) => ({
        name: item.name,
        amount: item.amount,
        os: item.os,
      })),
      entitlement: {
        isUnlimited: Boolean(entitlement.is_unlimited),
        downloadUsed: nextUsed,
        downloadLimit: limit,
      },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Unexpected server error' });
  }
}
