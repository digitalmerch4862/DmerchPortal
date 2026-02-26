import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import {
  buildEmailHtml,
  sendEmailWithStatus,
} from './email-service';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const MANILA_TIMEZONE = 'Asia/Manila';


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
    const totalAmount = Number(payload.totalAmount ?? 0) || products.reduce((sum, item) => sum + item.amount, 0);

    if (!username || !email || !productName || !totalAmount) {
      return res.status(400).json({ ok: false, error: 'Required fields are missing.' });
    }

    if (referenceNo.length !== 6) {
      return res.status(400).json({ ok: false, error: 'Please enter the last 6 digits for reference no (sample: 123456).' });
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
