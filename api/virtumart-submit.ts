import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const MANILA_TIMEZONE = 'Asia/Manila';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const formatPhpAmount = (amount: number) => `₱${Number(amount || 0).toFixed(2)}`;

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

const normalizeProductName = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');

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

const createToken = (payload: object, secret: string) => {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
};

const rpcToNumber = (rpcData: unknown) => {
  if (typeof rpcData === 'number') {
    return rpcData;
  }
  if (typeof rpcData === 'string') {
    return parseInt(rpcData, 10);
  }
  if (Array.isArray(rpcData) && rpcData.length > 0) {
    const first = rpcData[0];
    const value = typeof first === 'object' && first !== null ? Object.values(first)[0] : first;
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'string') {
      return parseInt(value, 10);
    }
  }
  return null;
};

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const getManilaSerialParts = (date: Date) => {
  const shortParts = new Intl.DateTimeFormat('en-US', {
    timeZone: MANILA_TIMEZONE,
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).formatToParts(date);

  const getPart = (parts: Intl.DateTimeFormatPart[], type: string) => {
    return parts.find((part) => part.type === type)?.value ?? '';
  };

  const year = getPart(shortParts, 'year');
  const monthShort = getPart(shortParts, 'month').toUpperCase();
  const day = getPart(shortParts, 'day');

  return {
    datePart: `${year}${monthShort}${day}`,
    monthSerialPrefix: `${year}${monthShort}`,
  };
};

const formatSubmittedDate = (dateIso: string) => {
  const date = new Date(dateIso);
  const dateText = date.toLocaleDateString('en-US', {
    timeZone: MANILA_TIMEZONE,
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });
  const timeText = date.toLocaleTimeString('en-US', {
    timeZone: MANILA_TIMEZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return `${dateText} | ${timeText}`;
};

const buildVirtuMartApprovedEmail = ({
  username,
  products,
  totalAmount,
  serialNo,
  availedPortal,
  orderReference,
  submittedOn,
  accessUrl,
}: {
  username: string;
  products: Array<{ name: string; amount: number }>;
  totalAmount: number;
  serialNo: string;
  availedPortal: 'lazada' | 'shopee';
  orderReference: string;
  submittedOn: string;
  accessUrl: string;
}) => {
  const rowsHtml = products
    .map((item) => `
      <tr>
        <td style="font-size:14px;border-bottom:1px solid #eeeeee;padding:10px 12px;">${escapeHtml(item.name)}</td>
        <td align="right" style="font-size:14px;border-bottom:1px solid #eeeeee;padding:10px 12px;">${formatPhpAmount(item.amount)}</td>
      </tr>`)
    .join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Segoe UI,Tahoma,Verdana,sans-serif;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%">
    <tr><td style="padding:20px 0;">
      <table align="center" border="0" cellpadding="0" cellspacing="0" width="600" style="background:#fff;border:1px solid #ddd;border-radius:8px;overflow:hidden;">
        <tr><td style="background:#111827;color:#fff;padding:30px 24px;">
          <h2 style="margin:0;font-size:22px;">Your DMerch Purchase is Ready</h2>
          <p style="margin:8px 0 0;font-size:13px;opacity:0.9;">Order auto-approved successfully</p>
        </td></tr>
        <tr><td style="padding:26px 24px;color:#333;line-height:1.6;font-size:14px;">
          <p>Hello <strong>${escapeHtml(username)}</strong>,</p>
          <p>Your order has been received, auto-approved, and is ready for download access.</p>
          <table border="0" cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #eeeeee;border-radius:6px;overflow:hidden;margin-top:14px;">
            <thead>
              <tr style="background:#fafafa;">
                <th align="left" style="font-size:12px;color:#6b7280;padding:10px 12px;border-bottom:2px solid #eeeeee;">PRODUCT DESCRIPTION</th>
                <th align="right" style="font-size:12px;color:#6b7280;padding:10px 12px;border-bottom:2px solid #eeeeee;">AMOUNT</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
              <tr style="background:#fcfcfc;">
                <td align="right" style="font-size:14px;font-weight:700;padding:10px 12px;">Total Paid</td>
                <td align="right" style="font-size:15px;font-weight:700;padding:10px 12px;">${formatPhpAmount(totalAmount)}</td>
              </tr>
            </tbody>
          </table>

          <div style="margin-top:18px;padding:16px;background:#f9fafb;border:1px solid #eceff4;border-radius:6px;">
            <p style="margin:0;font-size:12px;color:#6b7280;">ORDER SERIAL</p>
            <p style="margin:4px 0 12px;font-size:14px;font-family:monospace;color:#d32f2f;">${escapeHtml(serialNo)}</p>
            <p style="margin:0;font-size:12px;color:#6b7280;">AVAILED PORTAL</p>
            <p style="margin:4px 0 12px;font-size:14px;font-weight:600;">${escapeHtml(availedPortal.toUpperCase())}</p>
            <p style="margin:0;font-size:12px;color:#6b7280;">ORDER REFERENCE</p>
            <p style="margin:4px 0 12px;font-size:14px;font-weight:600;">${escapeHtml(orderReference)}</p>
            <p style="margin:0;font-size:12px;color:#6b7280;">SUBMITTED ON</p>
            <p style="margin:4px 0 0;font-size:14px;">${escapeHtml(submittedOn)}</p>
          </div>

          <p style="margin-top:20px;"><a href="${accessUrl}" style="display:inline-block;padding:12px 18px;background:#0284c7;color:#fff;text-decoration:none;border-radius:6px;">Access Your Downloads</a></p>
          <p style="font-size:12px;color:#666;">Use the same email and order serial if prompted for verification.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
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
  const resendApiKey = process.env.RESEND_API_KEY;
  const resendFromEmail = process.env.RESEND_FROM_EMAIL;
  const tokenSecret = process.env.DELIVERY_TOKEN_SECRET ?? supabaseServiceRoleKey;
  const appBaseUrl = process.env.APP_BASE_URL ?? 'https://paymentportal.digitalmerchs.store';
  const adminEmail = process.env.ADMIN_EMAIL ?? 'digitalmerch4862@gmail.com';

  if (!supabaseUrl || !supabaseServiceRoleKey || !resendApiKey || !resendFromEmail || !tokenSecret) {
    return res.status(500).json({ ok: false, error: 'Missing server configuration.' });
  }

  try {
    const body = await readBody(req);
    const username = String(body.username ?? '').trim();
    const email = String(body.email ?? '').trim().toLowerCase();
    const availedPortalRaw = String(body.availedPortal ?? '').trim().toLowerCase();
    const availedPortal = availedPortalRaw === 'lazada' || availedPortalRaw === 'shopee' ? availedPortalRaw : '';
    const orderReferenceRaw = String(body.orderReference ?? '').trim().toUpperCase();
    const productsRaw = Array.isArray(body.products) ? body.products : [];
    const products = productsRaw
      .map((item) => ({
        name: String(item?.name ?? '').trim(),
        amount: Number(item?.amount ?? 0),
      }))
      .filter((item) => item.name && Number.isFinite(item.amount) && item.amount > 0);
    const totalAmount = Number(body.totalAmount ?? 0) || products.reduce((sum, item) => sum + item.amount, 0);

    if (!username || !email || !availedPortal || products.length === 0 || !totalAmount) {
      return res.status(400).json({ ok: false, error: 'Required fields are missing.' });
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) {
      return res.status(400).json({ ok: false, error: 'Invalid email address.' });
    }

    const normalizedReference = availedPortal === 'lazada'
      ? orderReferenceRaw.replace(/\D/g, '')
      : orderReferenceRaw;

    if (availedPortal === 'lazada' && !/^\d{10,24}$/.test(normalizedReference)) {
      return res.status(400).json({ ok: false, error: 'Invalid Lazada order reference format.' });
    }

    if (availedPortal === 'shopee' && !/^#[A-Z0-9]{8,24}$/.test(normalizedReference)) {
      return res.status(400).json({ ok: false, error: 'Invalid Shopee order reference format.' });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const sequenceResponse = await supabase.rpc('next_verification_sequence');
    const sequenceNo = rpcToNumber(sequenceResponse.data);
    if (sequenceResponse.error || sequenceNo === null || Number.isNaN(sequenceNo)) {
      return res.status(500).json({ ok: false, error: sequenceResponse.error?.message ?? 'Could not generate order sequence.' });
    }

    const now = new Date();
    const { datePart, monthSerialPrefix } = getManilaSerialParts(now);
    const monthLookupPattern = `DMERCH-${monthSerialPrefix}%`;
    const monthlySerialLookup = await supabase
      .from('verification_orders')
      .select('serial_no')
      .like('serial_no', monthLookupPattern);

    if (monthlySerialLookup.error) {
      return res.status(500).json({ ok: false, error: monthlySerialLookup.error.message });
    }

    const monthlySerialRegex = new RegExp(`^DMERCH-${escapeRegex(monthSerialPrefix)}\\d{2}-(\\d+)$`);
    let maxMonthlySuffix = 0;
    for (const row of monthlySerialLookup.data ?? []) {
      const serial = String((row as any).serial_no ?? '');
      const match = serial.match(monthlySerialRegex);
      if (!match) {
        continue;
      }
      const numeric = Number(match[1]);
      if (!Number.isNaN(numeric)) {
        maxMonthlySuffix = Math.max(maxMonthlySuffix, numeric);
      }
    }

    const productLookup = await supabase.from('products').select('name, file_url');
    const productLinkMap = new Map<string, string>();
    if (!productLookup.error && productLookup.data) {
      for (const row of productLookup.data as Array<{ name: string; file_url: string | null }>) {
        const key = normalizeProductName(String(row.name ?? ''));
        const fileUrl = String(row.file_url ?? '').trim();
        if (key && fileUrl && !productLinkMap.has(key)) {
          productLinkMap.set(key, fileUrl);
        }
      }
    }

    const orderItems = products.map((item) => ({
      ...item,
      fileLink: productLinkMap.get(normalizeProductName(item.name)) ?? '',
    }));

    let serialNo = '';
    let insertedOrderId = '';
    let createdAt = '';
    const referenceNo = normalizedReference.replace(/[^A-Z0-9]/g, '').slice(0, 24);

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const nextSuffix = maxMonthlySuffix + 1 + attempt;
      const serialCandidate = `DMERCH-${datePart}-${String(nextSuffix).padStart(3, '0')}`;
      const initialStatus = 'review:approved | inbox:archived | payment:auto_approved | customer:pending_send | source:virtumart';

      const insertResponse = await supabase
        .from('verification_orders')
        .insert({
          sequence_no: sequenceNo,
          serial_no: serialCandidate,
          username,
          email,
          product_name: orderItems[0]?.name ?? 'Digital Product',
          amount: totalAmount,
          products_json: orderItems,
          total_amount: totalAmount,
          reference_no: referenceNo,
          payment_portal_used: availedPortal,
          payment_detail_used: normalizedReference,
          admin_email: adminEmail,
          email_status: initialStatus,
        })
        .select('id, created_at')
        .single();

      if (!insertResponse.error) {
        serialNo = serialCandidate;
        insertedOrderId = String(insertResponse.data.id);
        createdAt = String(insertResponse.data.created_at ?? now.toISOString());
        break;
      }

      const isSerialConflict = insertResponse.error.code === '23505'
        && ((insertResponse.error.message ?? '').toLowerCase().includes('serial_no')
          || (insertResponse.error.details ?? '').toLowerCase().includes('serial_no'));

      if (!isSerialConflict) {
        return res.status(500).json({ ok: false, error: insertResponse.error.message });
      }
    }

    if (!serialNo || !insertedOrderId) {
      return res.status(500).json({ ok: false, error: 'Could not generate order serial.' });
    }

    const approvedLookup = await supabase
      .from('verification_orders')
      .select('products_json, email_status')
      .eq('email', email)
      .ilike('email_status', '%review:approved%')
      .limit(500);

    if (!approvedLookup.error) {
      const approvedRows = (approvedLookup.data ?? []).filter((row) => isApprovedStatus(String((row as any).email_status ?? '')));
      const approvedProductCount = getDistinctApprovedProductCount(approvedRows as Array<{ products_json: unknown }>);
      const isUnlimited = approvedProductCount >= 3;

      await supabase
        .from('buyer_entitlements')
        .upsert(
          {
            email,
            approved_product_count: approvedProductCount,
            download_limit: 10,
            download_used: 0,
            is_unlimited: isUnlimited,
          },
          { onConflict: 'email' },
        );
    }

    const token = createToken({ email, serialNo }, tokenSecret);
    const accessUrl = `${appBaseUrl}/delivery?access=${encodeURIComponent(token)}`;
    const submittedOn = formatSubmittedDate(createdAt);

    const resend = new Resend(resendApiKey);
    let customerStatus = 'customer:sent';
    try {
      await resend.emails.send({
        from: resendFromEmail,
        to: email,
        subject: `DMerch Purchase Ready (${serialNo})`,
        html: buildVirtuMartApprovedEmail({
          username,
          products: orderItems,
          totalAmount,
          serialNo,
          availedPortal: availedPortal as 'lazada' | 'shopee',
          orderReference: normalizedReference,
          submittedOn,
          accessUrl,
        }),
      });
    } catch (error) {
      customerStatus = `customer:failed:${error instanceof Error ? error.message : 'unknown_email_error'}`;
    }

    const finalStatus = appendStatusTag('review:approved | inbox:archived | payment:auto_approved | source:virtumart', customerStatus);
    await supabase
      .from('verification_orders')
      .update({ email_status: finalStatus })
      .eq('id', insertedOrderId);

    return res.status(200).json({
      ok: true,
      serialNo,
      totalAmount,
      emailStatus: customerStatus,
    });
  } catch (error) {
    return res.status(400).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown server error.',
    });
  }
}
