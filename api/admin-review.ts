import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

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

const readBody = async (req: any) => {
  if (typeof req.body === 'string') {
    return JSON.parse(req.body);
  }
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }
  return {};
};

const createToken = (payload: object, secret: string) => {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
};

const isApprovedStatus = (status: string) => status.toLowerCase().includes('review:approved');

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
        <tr><td style="background:#111827;color:#fff;padding:30px 24px;">
          <h2 style="margin:0;font-size:22px;">Your DMerch Purchase is Ready</h2>
        </td></tr>
        <tr><td style="padding:26px 24px;color:#333;line-height:1.6;font-size:14px;">
          <p>Hello <strong>${username}</strong>,</p>
          <p>Your verification request has been approved. Use the button below to securely access your downloads.</p>
          <p><strong>Order Serial:</strong> ${serialNo}</p>
          <p><a href="${accessUrl}" style="display:inline-block;padding:12px 18px;background:#0284c7;color:#fff;text-decoration:none;border-radius:6px;">Access Your Downloads</a></p>
          <p style="font-size:12px;color:#666;">Use the same email and order serial if prompted for verification.</p>
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
  const appBaseUrl = process.env.APP_BASE_URL ?? 'https://paymentportal.digitalmerchs.store';

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
    const serialNo = String(body.serialNo ?? '').trim().toUpperCase();
    const action = String(body.action ?? '').trim().toLowerCase();
    const deliveryLink = String(body.deliveryLink ?? '').trim();
    const rawProductLinks = body.productLinks && typeof body.productLinks === 'object' ? body.productLinks : {};
    const productLinksByName = new Map<string, string>();
    for (const [rawName, rawLink] of Object.entries(rawProductLinks as Record<string, unknown>)) {
      const key = normalizeProductName(String(rawName ?? ''));
      const link = String(rawLink ?? '').trim();
      if (key && link && !productLinksByName.has(key)) {
        productLinksByName.set(key, link);
      }
    }

    // Fetch all products from Supabase to fill in missing links automatically
    const supabaseProducts = await supabase
      .from('products')
      .select('name, file_url');

    if (!supabaseProducts.error && supabaseProducts.data) {
      for (const p of supabaseProducts.data) {
        const key = normalizeProductName(String(p.name ?? ''));
        if (key && p.file_url) {
          // Only use if not explicitly provided by admin (though normally provided by admin is better)
          if (!productLinksByName.has(key)) {
            productLinksByName.set(key, String(p.file_url));
          }
        }
      }
    }

    if (!serialNo || !action) {
      return res.status(400).json({ ok: false, error: 'serialNo and action are required.' });
    }

    const resend = new Resend(resendApiKey);

    const lookup = await supabase
      .from('verification_orders')
      .select('id, serial_no, username, email, email_status, products_json')
      .eq('serial_no', serialNo)
      .single();

    if (lookup.error || !lookup.data) {
      return res.status(404).json({ ok: false, error: 'Order not found.' });
    }

    const currentStatus = String(lookup.data.email_status ?? '');

    if (action === 'reject') {
      const status = `${currentStatus} | review:rejected`;
      await supabase.from('verification_orders').update({ email_status: status }).eq('id', lookup.data.id);
      return res.status(200).json({ ok: true, status: 'rejected' });
    }

    const products = Array.isArray(lookup.data.products_json) ? lookup.data.products_json : [];
    const missingLinks: string[] = [];
    const updatedProducts = products.map((item: any) => {
      const productName = String(item?.name ?? '').trim();
      const normalizedName = normalizeProductName(productName);
      const resolvedLink = String(item?.fileLink ?? '').trim() || productLinksByName.get(normalizedName) || deliveryLink;

      if (!resolvedLink) {
        missingLinks.push(productName || 'Unnamed product');
      }

      return {
        ...item,
        fileLink: resolvedLink,
      };
    });

    if (missingLinks.length > 0) {
      return res.status(400).json({
        ok: false,
        error: `Missing file link for: ${missingLinks.join(' | ')}`,
      });
    }

    const status = `${currentStatus} | review:approved`;

    await supabase
      .from('verification_orders')
      .update({
        email_status: status,
        products_json: updatedProducts,
      })
      .eq('id', lookup.data.id);

    const approvedLookup = await supabase
      .from('verification_orders')
      .select('products_json, email_status')
      .eq('email', lookup.data.email)
      .ilike('email_status', '%review:approved%')
      .limit(500);

    if (!approvedLookup.error) {
      const approvedRows = (approvedLookup.data ?? []).filter((row) => isApprovedStatus(String(row.email_status ?? '')));
      const approvedProductCount = getDistinctApprovedProductCount(approvedRows);
      const isUnlimited = approvedProductCount >= 3;

      await supabase
        .from('buyer_entitlements')
        .upsert(
          {
            email: lookup.data.email,
            approved_product_count: approvedProductCount,
            download_limit: 10,
            download_used: 0,
            is_unlimited: isUnlimited,
          },
          { onConflict: 'email' },
        );
    }

    const token = createToken({ email: lookup.data.email, serialNo: lookup.data.serial_no }, tokenSecret);
    const accessUrl = `${appBaseUrl}/delivery?access=${encodeURIComponent(token)}`;

    await resend.emails.send({
      from: resendFromEmail,
      to: lookup.data.email,
      subject: `DMerch Delivery Access (${lookup.data.serial_no})`,
      html: buildApprovedEmailHtml({
        username: String(lookup.data.username ?? 'Customer'),
        serialNo: lookup.data.serial_no,
        accessUrl,
      }),
    });

    return res.status(200).json({ ok: true, status: 'approved' });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Unexpected server error' });
  }
}
