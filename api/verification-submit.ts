import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const MANILA_TIMEZONE = 'Asia/Manila';

const escapeHtml = (value: string) => {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

const formatPhpAmount = (amount: number) => `PHP ${amount.toFixed(2)}`;

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

  const numericParts = new Intl.DateTimeFormat('en-US', {
    timeZone: MANILA_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const getPart = (parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) => {
    return parts.find((part) => part.type === type)?.value ?? '';
  };

  const year = getPart(shortParts, 'year');
  const monthShort = getPart(shortParts, 'month').toUpperCase();
  const day = getPart(shortParts, 'day');
  const monthNumeric = getPart(numericParts, 'month');

  return {
    datePart: `${year}${monthShort}${day}`,
    monthKey: `${year}${monthNumeric}`,
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
    const referenceNo = String(payload.referenceNo ?? '').trim();
    const totalAmount = Number(payload.totalAmount ?? 0) || products.reduce((sum, item) => sum + item.amount, 0);

    if (!username || !email || !productName || !referenceNo || !totalAmount) {
      return res.status(400).json({ ok: false, error: 'Required fields are missing.' });
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) {
      return res.status(400).json({ ok: false, error: 'Invalid email address.' });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const resend = new Resend(resendApiKey);

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
    const { datePart, monthKey } = getManilaSerialParts(now);
    const monthlySequenceResponse = await supabase.rpc('next_monthly_sequence', { month_key: monthKey });
    const monthlySequenceNo = rpcToNumber(monthlySequenceResponse.data);

    if (monthlySequenceResponse.error || monthlySequenceNo === null || isNaN(monthlySequenceNo)) {
      return res.status(500).json({
        ok: false,
        error: 'Could not generate monthly purchase code sequence. Please try again.',
      });
    }

    const serialNo = `DMERCH-${datePart}-${String(monthlySequenceNo).padStart(3, '0')}`;

    const insertResponse = await supabase
      .from('verification_orders')
      .insert({
        sequence_no: sequenceNo,
        serial_no: serialNo,
        username,
        email,
        product_name: productName,
        amount: totalAmount,
        products_json: products.length > 0 ? products : [{ name: productName, amount: totalAmount }],
        total_amount: totalAmount,
        reference_no: referenceNo,
        admin_email: adminEmail,
        email_status: 'pending',
      })
      .select('id, created_at')
      .single();

    if (insertResponse.error) {
      return res.status(500).json({ ok: false, error: insertResponse.error.message });
    }

    const createdAt = insertResponse.data.created_at;
    const submittedOn = formatSubmittedDate(createdAt);
    const orderItems = products.length > 0 ? products : [{ name: productName, amount: totalAmount }];
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

    let emailStatus = 'sent';
    try {
      await Promise.all([
        resend.emails.send({
          from: resendFromEmail,
          to: email,
          subject,
          html: customerHtml,
        }),
        resend.emails.send({
          from: resendFromEmail,
          to: adminEmail,
          subject: `[ADMIN] ${subject}`,
          html: adminHtml,
        }),
      ]);
    } catch (emailError) {
      emailStatus = `failed: ${emailError instanceof Error ? emailError.message : 'Unknown email error'}`;
    }

    await supabase
      .from('verification_orders')
      .update({ email_status: emailStatus })
      .eq('id', insertResponse.data.id);

    res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
    return res.status(200).json({
      ok: true,
      serialNo,
      sequenceNo,
      createdAt,
      emailStatus,
      totalAmount,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Unexpected server error',
    });
  }
}
