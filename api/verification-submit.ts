import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const MANILA_TIMEZONE = 'Asia/Manila';
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

/* ──────────────────────────────────────────────────────────────
   EMAIL SERVICE  –  keep all email logic in this section.
   If you need to change templates or sending behaviour,
   edit ONLY this block.  Do NOT move these functions to a
   separate file – Vercel compiles each api/*.ts independently.
   ────────────────────────────────────────────────────────────── */

const escapeHtml = (value: string) => {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

const formatPhpAmount = (amount: number) => `₱${amount.toFixed(2)}`;

const extractResendErrorMessage = (result: unknown) => {
  if (!result || typeof result !== 'object') {
    return null;
  }

  const maybeError = (result as { error?: unknown }).error;
  if (!maybeError) {
    return null;
  }

  if (typeof maybeError === 'string') {
    return maybeError;
  }

  if (typeof maybeError === 'object' && maybeError !== null) {
    const message = (maybeError as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }

  return 'Unknown email delivery error';
};

const buildEmailHtml = ({
  username,
  products,
  totalAmount,
  serialNo,
  referenceNo,
  submittedOn,
  adminCopy = false,
}: {
  username: string;
  products: Array<{ name: string; amount: number }>;
  totalAmount: number;
  serialNo: string;
  referenceNo: string;
  submittedOn: string;
  adminCopy?: boolean;
}) => {
  const safeName = escapeHtml(username);
  const safeSerial = escapeHtml(serialNo);
  const safeReference = escapeHtml(referenceNo);
  const safeSubmitted = escapeHtml(submittedOn);
  const rowsHtml = products
    .map(
      (item) => `
                                    <tr>
                                        <td style="font-size: 14px; border-bottom: 1px solid #eeeeee;">${escapeHtml(item.name)}</td>
                                        <td align="right" style="font-size: 14px; border-bottom: 1px solid #eeeeee;">${formatPhpAmount(item.amount)}</td>
                                    </tr>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f4;">
    <table border="0" cellpadding="0" cellspacing="0" width="100%">
        <tr>
            <td style="padding: 20px 0;">
                <table align="center" border="0" cellpadding="0" cellspacing="0" width="600" style="background-color: #ffffff; border-radius: 8px; border: 1px solid #dddddd; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                    <tr>
                        <td align="center" style="padding: 40px 20px; background-color: #1a1a1a; color: #ffffff;">
                            <h1 style="margin: 0; font-size: 24px; letter-spacing: 1px; text-transform: uppercase;">DMerch ${adminCopy ? '[ADMIN COPY]' : ''}</h1>
                            <p style="margin: 5px 0 0; font-size: 14px; opacity: 0.8;">Verification Submitted Successfully</p>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 40px 30px;">
                            <p style="margin: 0 0 20px; font-size: 16px; color: #333333;">Hello <strong>${safeName}</strong>,</p>
                            <p style="margin: 0 0 30px; font-size: 15px; color: #555555; line-height: 1.6;">
                                We've received your payment verification request. Our team is currently reviewing the details. You will receive your digital assets once the transaction is fully validated.
                            </p>

                            <table border="0" cellpadding="12" cellspacing="0" width="100%" style="border: 1px solid #eeeeee; border-radius: 5px;">
                                <thead>
                                    <tr style="background-color: #fafafa;">
                                        <th align="left" style="font-size: 12px; color: #888888; border-bottom: 2px solid #eeeeee;">PRODUCT DESCRIPTION</th>
                                        <th align="right" style="font-size: 12px; color: #888888; border-bottom: 2px solid #eeeeee;">AMOUNT</th>
                                    </tr>
                                </thead>
                                <tbody>
${rowsHtml}
                                    <tr style="background-color: #fcfcfc;">
                                        <td align="right" style="font-weight: bold; font-size: 14px;">Total Paid</td>
                                        <td align="right" style="font-weight: bold; font-size: 16px; color: #1a1a1a;">${formatPhpAmount(totalAmount)}</td>
                                    </tr>
                                </tbody>
                            </table>

                            <div style="margin-top: 30px; padding: 20px; background-color: #f9f9f9; border-radius: 5px;">
                                <p style="margin: 0; font-size: 12px; color: #777777;">ORDER SERIAL</p>
                                <p style="margin: 4px 0 15px; font-family: monospace; font-size: 13px; color: #d32f2f; word-break: break-all;">
                                    ${safeSerial}
                                </p>
                                <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                    <tr>
                                        <td width="50%">
                                            <p style="margin: 0; font-size: 12px; color: #777777;">REFERENCE NO</p>
                                            <p style="margin: 4px 0 0; font-size: 14px; font-weight: bold;">${safeReference}</p>
                                        </td>
                                        <td width="50%">
                                            <p style="margin: 0; font-size: 12px; color: #777777;">SUBMITTED ON</p>
                                            <p style="margin: 4px 0 0; font-size: 14px;">${safeSubmitted}</p>
                                        </td>
                                    </tr>
                                </table>
                            </div>
                        </td>
                    </tr>
                    <tr>
                        <td align="center" style="padding: 30px; background-color: #f4f4f4; border-top: 1px solid #eeeeee;">
                            <p style="margin: 0; font-size: 12px; color: #999999;">
                                This is an automated notification from the DMerch system.
                            </p>
                            <p style="margin: 10px 0 0; font-size: 12px; color: #999999;">
                                Support: <a href="mailto:support@digitalmerchs.store" style="color: #007bff; text-decoration: none;">support@digitalmerchs.store</a>
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;
};

const buildFraudRejectedHtml = ({
  username,
  serialNo,
  referenceNo,
  blockedUntil,
}: {
  username: string;
  serialNo: string;
  referenceNo: string;
  blockedUntil: string;
}) => {
  const contestLink = 'mailto:digitalmerch4862@gmail.com?subject=Contest';
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Segoe UI,Tahoma,Verdana,sans-serif;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%">
    <tr><td style="padding:20px 0;">
      <table align="center" border="0" cellpadding="0" cellspacing="0" width="600" style="background:#fff;border:1px solid #ddd;border-radius:8px;overflow:hidden;">
        <tr><td style="background:#1a1a1a;color:#fff;padding:30px 24px;">
          <h2 style="margin:0;font-size:20px;">DMerch Verification Notice</h2>
        </td></tr>
        <tr><td style="padding:26px 24px;color:#333;line-height:1.6;font-size:14px;">
          <p>Hello <strong>${escapeHtml(username)}</strong>,</p>
          <p>After validation, we found that the payment reference submitted for your verification request could not be confirmed and has been flagged as invalid.</p>
          <p><strong>Order Serial:</strong> ${escapeHtml(serialNo)}<br/><strong>Reference No:</strong> ${escapeHtml(referenceNo)}</p>
          <p>Your account is placed under a temporary review hold until <strong>${escapeHtml(blockedUntil)}</strong>. You may submit verification again after this period.</p>
          <p>If you believe this decision is incorrect, you may contest it by emailing support:</p>
          <p><a href="${contestLink}" style="display:inline-block;padding:10px 16px;background:#0ea5e9;color:#fff;text-decoration:none;border-radius:6px;">Contest This Decision</a></p>
          <p style="font-size:12px;color:#666;">This is an automated risk-control notice from DMerch.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
};

const sendEmailWithStatus = async ({
  resend,
  from,
  to,
  mailSubject,
  html,
}: {
  resend: Resend;
  from: string;
  to: string;
  mailSubject: string;
  html: string;
}) => {
  try {
    const response = await resend.emails.send({
      from,
      to,
      subject: mailSubject,
      html,
    });
    const resendError = extractResendErrorMessage(response);
    if (resendError) {
      return `failed: ${resendError}`;
    }
    return 'sent';
  } catch (emailError) {
    return `failed: ${emailError instanceof Error ? emailError.message : 'Unknown email error'}`;
  }
};

/* ── END EMAIL SERVICE ─────────────────────────────────────── */

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

const getManilaSerialParts = (date: Date) => {
  const shortParts = new Intl.DateTimeFormat('en-US', {
    timeZone: MANILA_TIMEZONE,
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).formatToParts(date);

  const getPart = (parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) => {
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

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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

const getBlockedUntilFromStatus = (status: string) => {
  const match = status.match(/blocked_until:([^|;]+)/i);
  if (!match) {
    return null;
  }
  const parsed = new Date(match[1]);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const hasReviewStatus = (status: string, value: string) => status.toLowerCase().includes(`review:${value}`.toLowerCase());



const readBody = async (req: any) => {
  if (typeof req.body === 'string') {
    return JSON.parse(req.body);
  }

  if (req.body && typeof req.body === 'object') {
    return req.body;
  }

  if (typeof req.on === 'function') {
    const raw = await new Promise<string>((resolve, reject) => {
      let data = '';
      req.on('data', (chunk: Buffer | string) => {
        data += chunk.toString();
      });
      req.on('end', () => resolve(data));
      req.on('error', reject);
    });
    return raw ? JSON.parse(raw) : {};
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
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendApiKey = process.env.RESEND_API_KEY;
  const resendFromEmail = process.env.RESEND_FROM_EMAIL;
  const adminEmail = process.env.ADMIN_EMAIL ?? 'digitalmerch4862@gmail.com';

  if (!supabaseUrl || !supabaseServiceRoleKey || !resendApiKey || !resendFromEmail) {
    return res.status(500).json({
      ok: false,
      error: 'Missing required server environment variables.',
    });
  }

  try {
    const payload = await readBody(req);
    const username = String(payload.username ?? '').trim();
    const email = String(payload.email ?? '').trim();
    const productsRaw = Array.isArray(payload.products) ? payload.products : [];
    const products = productsRaw
      .map((item) => ({
        name: String(item?.name ?? '').trim(),
        amount: Number(item?.amount ?? 0),
      }))
      .filter((item) => item.name && !Number.isNaN(item.amount) && item.amount > 0);
    const productName = products[0]?.name ?? String(payload.productName ?? '').trim();
    const referenceNo = String(payload.referenceNo ?? '').replace(/\D/g, '').slice(-6);
    const paymentPortalUsedRaw = String(payload.paymentPortalUsed ?? '').trim().toLowerCase();
    const paymentPortalUsed = paymentPortalUsedRaw === 'gotyme' ? 'gotyme' : paymentPortalUsedRaw === 'gcash' ? 'gcash' : '';
    const paymentDetailUsed = String(payload.paymentDetailUsed ?? '').trim();
    const totalAmount = Number(payload.totalAmount ?? 0) || products.reduce((sum, item) => sum + item.amount, 0);

    if (!username || !email || !productName || !totalAmount) {
      return res.status(400).json({ ok: false, error: 'Required fields are missing.' });
    }

    if (referenceNo.length !== 6) {
      return res.status(400).json({ ok: false, error: 'Please enter the last 6 digits for reference no (sample: 123456).' });
    }

    if (!paymentPortalUsed) {
      return res.status(400).json({ ok: false, error: 'Payment portal used is required (GCash or GoTyme).' });
    }

    if (!paymentDetailUsed) {
      return res.status(400).json({ ok: false, error: paymentPortalUsed === 'gcash' ? 'GCash number used is required.' : 'GoTyme account name used is required.' });
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) {
      return res.status(400).json({ ok: false, error: 'Invalid email address.' });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const resend = new Resend(resendApiKey);

    const latestEmailRows = await supabase
      .from('verification_orders')
      .select('email_status, created_at')
      .eq('email', email)
      .order('created_at', { ascending: false })
      .limit(8);

    if (latestEmailRows.error) {
      return res.status(500).json({ ok: false, error: latestEmailRows.error.message });
    }

    const activeBlock = (latestEmailRows.data ?? [])
      .map((row) => getBlockedUntilFromStatus(String(row.email_status ?? '')))
      .find((date) => date && date.getTime() > Date.now());

    if (activeBlock) {
      return res.status(403).json({
        ok: false,
        error: `Verification is temporarily restricted until ${formatSubmittedDate(activeBlock.toISOString())}. If you want to contest this decision, email digitalmerch4862@gmail.com with subject: Contest.`,
        code: 'SOFT_BLOCKED',
      });
    }

    const existingByReference = await supabase
      .from('verification_orders')
      .select('email, total_amount, serial_no, email_status')
      .eq('reference_no', referenceNo)
      .limit(12);

    if (existingByReference.error) {
      return res.status(500).json({ ok: false, error: existingByReference.error.message });
    }

    const mismatchedReference = (existingByReference.data ?? []).some((row) => {
      const rowStatus = String(row.email_status ?? '');
      if (hasReviewStatus(rowStatus, 'rejected_fake')) {
        return true;
      }
      return String(row.email ?? '').toLowerCase() !== email.toLowerCase() || Number(row.total_amount ?? 0) !== totalAmount;
    });

    const sequenceResponse = await supabase.rpc('next_verification_sequence');
    const sequenceNo = rpcToNumber(sequenceResponse.data);

    if (sequenceResponse.error || sequenceNo === null || isNaN(sequenceNo)) {
      console.error('Sequence generation error:', JSON.stringify(sequenceResponse.error), 'Data:', JSON.stringify(sequenceResponse.data), 'Type:', typeof sequenceResponse.data);
      const hint = sequenceResponse.error?.message?.includes('Invalid API key')
        ? 'Server configuration error: Invalid Supabase API key. Please contact the admin.'
        : 'Could not generate sequence. Please try again or contact the admin.';
      return res.status(500).json({
        ok: false,
        error: hint,
      });
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
      const serial = String(row.serial_no ?? '');
      const match = serial.match(monthlySerialRegex);
      if (!match) {
        continue;
      }

      const numeric = Number(match[1]);
      if (!Number.isNaN(numeric)) {
        maxMonthlySuffix = Math.max(maxMonthlySuffix, numeric);
      }
    }

    const orderItems = products.length > 0 ? products : [{ name: productName, amount: totalAmount }];
    const maxInsertAttempts = 6;
    let serialNo = '';
    let createdAt = '';
    let insertedOrderId = '';

    for (let attempt = 0; attempt < maxInsertAttempts; attempt += 1) {
      const nextSuffix = maxMonthlySuffix + 1 + attempt;
      const serialCandidate = `DMERCH-${datePart}-${String(nextSuffix).padStart(3, '0')}`;

      const insertResponse = await supabase
        .from('verification_orders')
        .insert({
          sequence_no: sequenceNo,
          serial_no: serialCandidate,
          username,
          email,
          product_name: productName,
          amount: totalAmount,
          products_json: orderItems,
          total_amount: totalAmount,
          reference_no: referenceNo,
          payment_portal_used: paymentPortalUsed,
          payment_detail_used: paymentDetailUsed,
          admin_email: adminEmail,
          email_status: 'pending',
        })
        .select('id, created_at')
        .single();

      if (!insertResponse.error) {
        serialNo = serialCandidate;
        createdAt = insertResponse.data.created_at;
        insertedOrderId = insertResponse.data.id;
        break;
      }

      const isSerialConflict = insertResponse.error.code === '23505'
        && ((insertResponse.error.message ?? '').toLowerCase().includes('serial_no')
          || (insertResponse.error.details ?? '').toLowerCase().includes('serial_no'));

      if (!isSerialConflict) {
        return res.status(500).json({ ok: false, error: insertResponse.error.message });
      }
    }

    if (!serialNo || !createdAt || !insertedOrderId) {
      return res.status(500).json({ ok: false, error: 'Could not generate monthly purchase code sequence. Please try again.' });
    }

    if (mismatchedReference) {
      const blockedUntilDate = new Date(Date.now() + THREE_DAYS_MS);
      const blockedUntilIso = blockedUntilDate.toISOString();
      const blockedUntilText = formatSubmittedDate(blockedUntilIso);
      const rejectionStatus = `review:rejected_fake | blocked_until:${blockedUntilIso}`;

      await supabase
        .from('verification_orders')
        .update({ email_status: rejectionStatus })
        .eq('id', insertedOrderId);

      const rejectedHtml = buildFraudRejectedHtml({
        username,
        serialNo,
        referenceNo,
        blockedUntil: blockedUntilText,
      });

      const rejectedEmailStatus = await sendEmailWithStatus({
        resend,
        from: resendFromEmail,
        to: email,
        mailSubject: `Verification Rejected: Reference Validation Issue (${serialNo})`,
        html: rejectedHtml,
      });

      await supabase
        .from('verification_orders')
        .update({ email_status: `${rejectionStatus} | customer:${rejectedEmailStatus}` })
        .eq('id', insertedOrderId);

      return res.status(403).json({
        ok: false,
        code: 'FAKE_REFERENCE',
        error: `Reference validation failed. Your email is under temporary review hold until ${blockedUntilText}. You may contest by emailing digitalmerch4862@gmail.com with subject: Contest.`,
      });
    }

    const submittedOn = formatSubmittedDate(createdAt);
    const subject = `DMerch Verification ${serialNo}`;
    const customerHtml = buildEmailHtml({
      username,
      products: orderItems,
      totalAmount,
      serialNo,
      referenceNo,
      submittedOn,
    });
    const adminHtml = buildEmailHtml({
      username,
      products: orderItems,
      totalAmount,
      serialNo,
      referenceNo,
      submittedOn,
      adminCopy: true,
    });

    const [customerEmailStatus, adminEmailStatus] = await Promise.all([
      sendEmailWithStatus({
        resend,
        from: resendFromEmail,
        to: email,
        mailSubject: subject,
        html: customerHtml,
      }),
      sendEmailWithStatus({
        resend,
        from: resendFromEmail,
        to: adminEmail,
        mailSubject: `[ADMIN] ${subject}`,
        html: adminHtml,
      }),
    ]);

    const statusParts = [];
    statusParts.push('review:pending');
    statusParts.push(`customer:${customerEmailStatus}`);
    statusParts.push(`admin:${adminEmailStatus}`);
    const emailStatus = statusParts.join(' | ');
    const customerEmailDelivered = customerEmailStatus === 'sent';

    await supabase
      .from('verification_orders')
      .update({ email_status: emailStatus })
      .eq('id', insertedOrderId);

    res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
    return res.status(200).json({
      ok: true,
      serialNo,
      sequenceNo,
      createdAt,
      emailStatus,
      customerEmailStatus,
      adminEmailStatus,
      customerEmailDelivered,
      totalAmount,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Unexpected server error',
    });
  }
}
