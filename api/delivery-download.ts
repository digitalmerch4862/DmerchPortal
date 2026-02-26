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
  downloadCount?: number;
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
      .select('id, serial_no, email, email_status, products_json')
      .eq('serial_no', tokenPayload.serialNo)
      .eq('email', tokenPayload.email)
      .single();

    if (orderLookup.error || !orderLookup.data) {
      return res.status(404).json({ ok: false, error: 'Order not found.' });
    }

    const status = String(orderLookup.data.email_status ?? '');
    if (!isApprovedStatus(status)) {
      return res.status(403).json({ ok: false, error: 'Order is not approved yet.' });
    }

    const products = Array.isArray(orderLookup.data.products_json)
      ? (orderLookup.data.products_json as OrderProduct[])
      : [];

    const totalDownloads = products.reduce((sum, item) => sum + Number(item.downloadCount ?? 0), 0);
    if (totalDownloads >= 10) {
      return res.status(403).json({ ok: false, error: 'Download limit reached. Please contact support.', code: 'DOWNLOAD_LIMIT_REACHED' });
    }

    const targetIndex = products.findIndex((item) => String(item.name ?? '').trim() === productName);
    if (targetIndex < 0) {
      return res.status(404).json({ ok: false, error: 'Selected product is not mapped for this order.' });
    }

    const target = products[targetIndex];
    const targetLink = String(target.fileLink ?? '').trim();
    if (!targetLink) {
      return res.status(400).json({ ok: false, error: 'No delivery link configured yet for this product.' });
    }

    const updatedProducts = products.map((item, index) => {
      if (index !== targetIndex) {
        return item;
      }
      return {
        ...item,
        downloadCount: Number(item.downloadCount ?? 0) + 1,
      };
    });

    await supabase
      .from('verification_orders')
      .update({ products_json: updatedProducts })
      .eq('id', orderLookup.data.id);

    res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
    return res.status(200).json({
      ok: true,
      redirectUrl: targetLink,
      products: updatedProducts.map((item) => ({
        name: item.name,
        amount: item.amount,
        os: item.os,
        downloadCount: item.downloadCount ?? 0,
      })),
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Unexpected server error' });
  }
}
