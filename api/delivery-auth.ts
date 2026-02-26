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

    const products = Array.isArray(orderLookup.data.products_json)
      ? (orderLookup.data.products_json as OrderProduct[])
      : [];

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
        downloadCount: item.downloadCount ?? 0,
      })),
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Unexpected server error' });
  }
}
