import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const ALLOWED_ADMIN_EMAILS = new Set(['digitalmerch4862@gmail.com']);

const resolveCorsOrigin = (req: any) => {
  const appBase = process.env.APP_BASE_URL ?? 'https://digitalmerchs.store';
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

const readBody = async (req: any) => {
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  if (typeof req.on === 'function') {
    try {
      const raw = await new Promise<string>((resolve, reject) => {
        let data = '';
        req.on('data', (chunk: any) => {
          data += chunk.toString();
        });
        req.on('end', () => resolve(data));
        req.on('error', reject);
      });
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }
  return {};
};

const createToken = (payload: object, secret: string) => {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
};

const getDistinctApprovedProductCount = (rows: Array<{ products_json: unknown }>) => {
  const distinct = new Set<string>();
  for (const row of rows) {
    const products = Array.isArray(row.products_json) ? row.products_json : [];
    for (const item of products as Array<{ name?: unknown }>) {
      const name = String(item?.name ?? '').trim().toLowerCase();
      if (name) {
        distinct.add(name);
      }
    }
  }
  return distinct.size;
};

const normalizeProductName = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');

const CONTACT_LINKS_HTML = `
  <div style="margin-top: 18px; padding-top: 14px; border-top: 1px solid #e5e7eb;">
    <p style="margin: 0 0 8px; font-size: 12px; color: #4b5563; font-weight: 600;">Need help or want more products?</p>
    <p style="margin: 0 0 4px; font-size: 12px; color: #6b7280;">
      FB: <a href="https://www.facebook.com/digitalmerch4862/" style="color:#0ea5e9; text-decoration:none;">https://www.facebook.com/digitalmerch4862/</a>
    </p>
    <p style="margin: 0 0 4px; font-size: 12px; color: #6b7280;">
      YT: <a href="https://youtube.com/@digitalmerch-sy7yt?si=c8VCo5afd47Rf5Df" style="color:#0ea5e9; text-decoration:none;">https://youtube.com/@digitalmerch-sy7yt?si=c8VCo5afd47Rf5Df</a>
    </p>
    <p style="margin: 0 0 4px; font-size: 12px; color: #6b7280;">
      Instagram: <a href="https://www.instagram.com/digitalmerch4862/" style="color:#0ea5e9; text-decoration:none;">https://www.instagram.com/digitalmerch4862/</a>
    </p>
    <p style="margin: 0 0 4px; font-size: 12px; color: #6b7280;">
      Email Us: <a href="mailto:digitalmerch4862@gmail.com" style="color:#0ea5e9; text-decoration:none;">digitalmerch4862@gmail.com</a>
    </p>
    <p style="margin: 10px 0 4px; font-size: 12px; color: #4b5563; font-weight: 600;">Lazada Shop</p>
    <p style="margin: 0; font-size: 12px; color: #6b7280;">
      Digitalmerch: <a href="https://www.lazada.com.ph/shop/3ecyybmf" style="color:#0ea5e9; text-decoration:none;">https://www.lazada.com.ph/shop/3ecyybmf</a>
    </p>
  </div>`;

const buildApprovedEmailHtml = ({
  username,
  serialNo,
  accessUrl,
}: {
  username: string;
  serialNo: string;
  accessUrl: string;
}) => `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Segoe UI,Tahoma,Verdana,sans-serif;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%">
    <tr><td style="padding:20px 0;">
      <table align="center" border="0" cellpadding="0" cellspacing="0" width="600" style="background:#fff;border:1px solid #ddd;border-radius:8px;overflow:hidden;">
        <tr><td style="background:#111827;color:#fff;padding:30px 24px;text-align:center;">
          <img src="https://dmerch-portal.vercel.app/android-chrome-512x512.png" alt="DMerch Logo" style="width: 80px; height: 80px; margin-bottom: 15px; display: inline-block;" />
          <h2 style="margin:0;font-size:22px;">Your DMerch Purchase is Ready</h2>
        </td></tr>
        <tr><td style="padding:26px 24px;color:#333;line-height:1.6;font-size:14px;">
          <p>Hello <strong>${username}</strong>,</p>
          <p>Your verification request has been approved. Use the button below to securely access your downloads.</p>
          <p><strong>Order Serial:</strong> ${serialNo}</p>
          <p><a href="${accessUrl}" style="display:inline-block;padding:12px 18px;background:#0284c7;color:#fff;text-decoration:none;border-radius:6px;">Access Your Downloads</a></p>
          <p style="font-size:12px;color:#666;">Use the same email and order serial if prompted for verification.</p>
          ${CONTACT_LINKS_HTML}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

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

const generateSerialNo = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'MAN-';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
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
  const resendApiKey = process.env.RESEND_API_KEY;
  const resendFromEmail = process.env.RESEND_FROM_EMAIL;
  const tokenSecret = process.env.DELIVERY_TOKEN_SECRET ?? supabaseServiceRoleKey;
  const appBaseUrl = process.env.APP_BASE_URL ?? 'https://digitalmerchs.store';

  if (!supabaseUrl || !supabaseServiceRoleKey || !resendApiKey || !resendFromEmail || !tokenSecret) {
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
    const buyerName = String(body.buyerName ?? '').trim();
    const buyerEmail = String(body.buyerEmail ?? '').trim().toLowerCase();
    const productsRaw = Array.isArray(body.products) ? body.products : [];
    const products = productsRaw.map((item: unknown) => String(item ?? '').trim()).filter(Boolean);
    const totalAmount = Number(body.totalAmount ?? 0);

    if (!buyerName || !buyerEmail || products.length === 0) {
      return res.status(400).json({ ok: false, error: 'buyerName, buyerEmail, and products are required.' });
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(buyerEmail)) {
      return res.status(400).json({ ok: false, error: 'Invalid buyer email address.' });
    }

    const serialNo = generateSerialNo();
    const perProductAmount = products.length > 0 ? Number((totalAmount / products.length).toFixed(2)) : 0;
    const productsJson = products.map((name) => ({ name, amount: perProductAmount }));

    const productsLookup = await supabase
      .from('products')
      .select('name, file_url')
      .order('name');

    const productLinkMap = new Map<string, string>();
    if (!productsLookup.error && productsLookup.data) {
      for (const p of productsLookup.data) {
        const key = normalizeProductName(String(p.name ?? ''));
        if (key && p.file_url) {
          productLinkMap.set(key, String(p.file_url));
        }
      }
    }

    const updatedProducts = productsJson.map((item: any) => {
      const productName = String(item?.name ?? '').trim();
      const normalizedName = normalizeProductName(productName);
      const resolvedLink = productLinkMap.get(normalizedName) || '';
      return {
        ...item,
        fileLink: resolvedLink,
      };
    });

    const resend = new Resend(resendApiKey);

    const sequenceResponse = await supabase.rpc('next_verification_sequence');
    const sequenceNo = sequenceResponse.data as number | null;

    if (sequenceResponse.error || sequenceNo === null || isNaN(sequenceNo)) {
      return res.status(500).json({ ok: false, error: 'Could not generate sequence number.' });
    }

    const insertResult = await supabase
      .from('verification_orders')
      .insert({
        serial_no: serialNo,
        sequence_no: sequenceNo,
        reference_no: serialNo,
        username: buyerName,
        email: buyerEmail,
        product_name: products[0],
        amount: totalAmount,
        total_amount: totalAmount,
        products_json: updatedProducts,
        email_status: 'review:approved',
        payment_portal_used: 'MANUAL',
        payment_detail_used: 'Manual Entry - No Payment Required',
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertResult.error) {
      return res.status(500).json({ ok: false, error: `Database insert failed: ${insertResult.error.message}` });
    }

    const approvedLookup = await supabase
      .from('verification_orders')
      .select('products_json, email_status')
      .eq('email', buyerEmail)
      .ilike('email_status', '%review:approved%')
      .limit(500);

    if (!approvedLookup.error) {
      const approvedRows = (approvedLookup.data ?? []).filter((row) => {
        const status = String(row.email_status ?? '').toLowerCase();
        return status.includes('review:approved');
      });
      const approvedProductCount = getDistinctApprovedProductCount(approvedRows);
      const isUnlimited = approvedProductCount >= 3;

      await supabase
        .from('buyer_entitlements')
        .upsert(
          {
            email: buyerEmail,
            approved_product_count: approvedProductCount,
            download_limit: 10,
            download_used: 0,
            is_unlimited: isUnlimited,
          },
          { onConflict: 'email' },
        );
    }

    const token = createToken({ email: buyerEmail, serialNo }, tokenSecret);
    const accessUrl = `${appBaseUrl}/delivery?access=${encodeURIComponent(token)}`;

    try {
      await resend.emails.send({
        from: resendFromEmail,
        to: buyerEmail,
        subject: `DMerch Delivery Access (${serialNo})`,
        html: buildApprovedEmailHtml({
          username: buyerName,
          serialNo,
          accessUrl,
        }),
      });
    } catch (emailError) {
      return res.status(500).json({
        ok: false,
        error: `Order created but email failed to send: ${emailError instanceof Error ? emailError.message : 'Unknown email error'}`,
      });
    }

    return res.status(200).json({
      ok: true,
      serialNo,
      message: 'Order created and approved successfully. Delivery email sent.',
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Unexpected server error' });
  }
}
