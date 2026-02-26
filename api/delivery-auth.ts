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

const base64UrlEncode = (value: string) => Buffer.from(value, 'utf8').toString('base64url');
const base64UrlDecode = (value: string) => Buffer.from(value, 'base64url').toString('utf8');

const signPayload = (payload: object, secret: string) => {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = crypto.createHmac('sha256', secret).update(encodedPayload).digest('base64url');
  return `${encodedPayload}.${signature}`;
};

const verifyToken = (token: string, secret: string) => {
  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) {
    return null;
  }
  const expected = crypto.createHmac('sha256', secret).update(encodedPayload).digest('base64url');
  if (signature !== expected) {
    return null;
  }
  try {
    return JSON.parse(base64UrlDecode(encodedPayload)) as { email: string; serialNo: string };
  } catch {
    return null;
  }
};

const isApprovedStatus = (status: string) => status.toLowerCase().includes('review:approved');

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
      const current = byKey.get(key);
      const link = String(product.fileLink ?? '').trim();
      if (!current) {
        byKey.set(key, {
          name,
          amount: Number(product.amount ?? 0),
          os: product.os,
          fileLink: link,
          serialNo: row.serial_no,
        });
        continue;
      }

      if (!current.fileLink && link) {
        byKey.set(key, {
          ...current,
          fileLink: link,
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
    const incomingToken = String(body.token ?? '').trim();
    let email = String(body.email ?? '').trim().toLowerCase();
    let serialNo = String(body.serialNo ?? '').trim().toUpperCase();

    if (incomingToken) {
      const parsed = verifyToken(incomingToken, tokenSecret);
      if (!parsed) {
        return res.status(401).json({ ok: false, error: 'Invalid access token.' });
      }
      email = String(parsed.email ?? '').trim().toLowerCase();
      serialNo = String(parsed.serialNo ?? '').trim().toUpperCase();
    }

    if (!email || !serialNo) {
      return res.status(400).json({ ok: false, error: 'Email and order serial are required.' });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const orderLookup = await supabase
      .from('verification_orders')
      .select('serial_no, email, email_status, products_json')
      .eq('serial_no', serialNo)
      .eq('email', email)
      .single();

    if (orderLookup.error || !orderLookup.data) {
      return res.status(404).json({ ok: false, error: 'Order record not found for this email and serial.' });
    }

    const emailStatus = String(orderLookup.data.email_status ?? '');
    if (!isApprovedStatus(emailStatus)) {
      return res.status(403).json({ ok: false, error: 'Order is not approved for delivery yet.' });
    }

    const approvedOrders = await supabase
      .from('verification_orders')
      .select('serial_no, products_json, email_status')
      .eq('email', email)
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
      .eq('email', email)
      .single();

    const entitlement = entitlementLookup.data as BuyerEntitlement | null;

    const token = signPayload({ email, serialNo }, tokenSecret);

    res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
    return res.status(200).json({
      ok: true,
      token,
      serialNo,
      products: products.map((item) => ({
        name: item.name,
        amount: item.amount,
        os: item.os,
      })),
      entitlement: entitlement
        ? {
            approvedProductCount: Number(entitlement.approved_product_count ?? 0),
            downloadUsed: Number(entitlement.download_used ?? 0),
            downloadLimit: Number(entitlement.download_limit ?? 10),
            isUnlimited: Boolean(entitlement.is_unlimited),
          }
        : {
            approvedProductCount: 0,
            downloadUsed: 0,
            downloadLimit: 10,
            isUnlimited: false,
          },
      authRule: 'email_plus_serial_required',
      scope: 'all_approved_products_for_email',
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Unexpected server error' });
  }
}
