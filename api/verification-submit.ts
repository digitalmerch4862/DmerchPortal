import {createClient} from '@supabase/supabase-js';
import {Resend} from 'resend';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const sanitizeProductForSerial = (name: string) => {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 36)
    .replace(/^-|-$/g, '');
};

const sanitizeUsernameForSerial = (name: string) => {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 24)
    .replace(/^-|-$/g, '');
};

const formatDate = (date: Date) => {
  const yyyy = date.getFullYear();
  const month = date.toLocaleString('en-US', {month: 'short'}).toUpperCase();
  const dd = `${date.getDate()}`.padStart(2, '0');
  return `${yyyy}${month}${dd}`;
};

const buildSerialBase = (username: string, productName: string, now: Date) => {
  const datePart = formatDate(now);
  const productPart = sanitizeProductForSerial(productName) || 'PRODUCT';
  const usernamePart = sanitizeUsernameForSerial(username) || 'buyer';
  return `DMERCH-${datePart}-${usernamePart}-${productPart}`;
};

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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
    return res.status(405).json({ok: false, error: 'Method not allowed'});
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
      return res.status(400).json({ok: false, error: 'Required fields are missing.'});
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) {
      return res.status(400).json({ok: false, error: 'Invalid email address.'});
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {persistSession: false, autoRefreshToken: false},
    });
    const resend = new Resend(resendApiKey);

    const sequenceResponse = await supabase.rpc('next_verification_sequence');
    if (sequenceResponse.error || typeof sequenceResponse.data !== 'number') {
      return res.status(500).json({
        ok: false,
        error: 'Could not generate sequence. Please run the SQL setup file in Supabase.',
      });
    }

    const sequenceNo = Number(sequenceResponse.data);
    const now = new Date();
    const serialBase = buildSerialBase(username, productName, now);

    const serialLookup = await supabase
      .from('verification_orders')
      .select('serial_no')
      .like('serial_no', `${serialBase}%`);

    if (serialLookup.error) {
      return res.status(500).json({ok: false, error: serialLookup.error.message});
    }

    const serialRegex = new RegExp(`^${escapeRegex(serialBase)}(?:-(\\d+))?$`);
    let maxSuffix = 0;
    for (const row of serialLookup.data ?? []) {
      const serial = String(row.serial_no ?? '');
      const match = serial.match(serialRegex);
      if (!match) {
        continue;
      }

      if (!match[1]) {
        maxSuffix = Math.max(maxSuffix, 1);
      } else {
        maxSuffix = Math.max(maxSuffix, Number(match[1]));
      }
    }

    const serialNo = maxSuffix === 0 ? serialBase : `${serialBase}-${maxSuffix + 1}`;

    const insertResponse = await supabase
      .from('verification_orders')
      .insert({
        sequence_no: sequenceNo,
        serial_no: serialNo,
        username,
        email,
        product_name: productName,
        amount: totalAmount,
        products_json: products.length > 0 ? products : [{name: productName, amount: totalAmount}],
        total_amount: totalAmount,
        reference_no: referenceNo,
        admin_email: adminEmail,
        email_status: 'pending',
      })
      .select('id, created_at')
      .single();

    if (insertResponse.error) {
      return res.status(500).json({ok: false, error: insertResponse.error.message});
    }

    const createdAt = insertResponse.data.created_at;
    const emailDate = new Date(createdAt).toLocaleString('en-PH', {timeZone: 'Asia/Manila'});
    const productHtml = (products.length > 0 ? products : [{name: productName, amount: totalAmount}])
      .map((item) => `<li>${item.name} - PHP ${item.amount}</li>`)
      .join('');
    const subject = `DMerch Verification ${serialNo}`;
    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111;">
        <h2 style="margin:0 0 12px;">DMerch Verification Submitted</h2>
        <p style="margin:0 0 8px;"><strong>Order Serial:</strong> ${serialNo}</p>
        <p style="margin:0 0 8px;"><strong>Username:</strong> ${username}</p>
        <p style="margin:0 0 8px;"><strong>Products:</strong></p>
        <ul style="margin:0 0 8px 18px;padding:0;">${productHtml}</ul>
        <p style="margin:0 0 8px;"><strong>Total Amount:</strong> PHP ${totalAmount}</p>
        <p style="margin:0 0 8px;"><strong>Reference No:</strong> ${referenceNo}</p>
        <p style="margin:0 0 8px;"><strong>Submitted:</strong> ${emailDate}</p>
        <p style="margin:14px 0 0;">Keep this serial for tracking and support updates.</p>
      </div>
    `;

    let emailStatus = 'sent';
    try {
      await Promise.all([
        resend.emails.send({
          from: resendFromEmail,
          to: email,
          subject,
          html,
        }),
        resend.emails.send({
          from: resendFromEmail,
          to: adminEmail,
          subject: `[ADMIN] ${subject}`,
          html,
        }),
      ]);
    } catch (emailError) {
      emailStatus = `failed: ${emailError instanceof Error ? emailError.message : 'Unknown email error'}`;
    }

    await supabase
      .from('verification_orders')
      .update({email_status: emailStatus})
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
