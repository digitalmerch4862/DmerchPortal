import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
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

type DownloadTicketPayload = {
  ticketId: string;
  email: string;
  serialNo: string;
  productName: string;
  exp: number;
  uaHash?: string;
  ipHash?: string;
};

type DeliveryStatus = 'approved' | 'rejected';

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

const normalizeForMatch = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');

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

const signDownloadTicket = (payload: DownloadTicketPayload, secret: string) => {
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(encodedPayload).digest('base64url');
  return `${encodedPayload}.${signature}`;
};

const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

const getUserAgentHash = (req: any) => {
  const raw = String(req.headers['user-agent'] ?? '').trim().toLowerCase();
  return raw ? sha256(raw) : '';
};

const getIpHash = (req: any) => {
  const forwarded = String(req.headers['x-forwarded-for'] ?? '').trim();
  const ip = forwarded.split(',')[0]?.trim() || String(req.socket?.remoteAddress ?? '').trim();
  return ip ? sha256(ip) : '';
};

const verifyTicket = (ticket: string, secret: string): DownloadTicketPayload | null => {
  const [encodedPayload, signature] = ticket.split('.');
  if (!encodedPayload || !signature) {
    return null;
  }

  const expected = crypto.createHmac('sha256', secret).update(encodedPayload).digest('base64url');
  if (signature !== expected) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as DownloadTicketPayload;
    if (!payload.ticketId || !payload.email || !payload.serialNo || !payload.productName || !payload.exp) {
      return null;
    }
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
};

const isApprovedStatus = (status: string) => status.toLowerCase().includes('review:approved');

const aggregateProductsByStatus = (
  rows: Array<{ products_json: unknown; serial_no: string }>,
  status: DeliveryStatus,
) => {
  const byKey = new Map<string, { name: string; amount: number; os?: string; fileLink?: string; serialNo: string; status: DeliveryStatus }>();

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
          status,
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

const toDirectDownloadLink = (url: string) => {
  if (!url.includes('drive.google.com')) {
    return url;
  }

  const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return `https://drive.google.com/uc?export=download&id=${match[1]}`;
  }

  return url;
};

const sanitizeFileName = (name: string) => {
  const normalized = name.replace(/[^a-zA-Z0-9._ -]/g, '').trim();
  if (!normalized) {
    return 'digitalmerch-download';
  }
  return normalized;
};

const extractFilenameFromContentDisposition = (raw: string) => {
  const value = String(raw ?? '').trim();
  if (!value) return '';
  const utf8Match = value.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]).replace(/["']/g, '').trim();
    } catch {
      return utf8Match[1].replace(/["']/g, '').trim();
    }
  }
  const plainMatch = value.match(/filename="?([^";]+)"?/i);
  return plainMatch?.[1]?.trim() || '';
};

const extensionFromContentType = (raw: string) => {
  const ct = String(raw ?? '').toLowerCase().split(';')[0].trim();
  const map: Record<string, string> = {
    'application/pdf': '.pdf',
    'application/zip': '.zip',
    'application/x-zip-compressed': '.zip',
    'application/x-compressed': '.zip',
    'application/x-rar-compressed': '.rar',
    'application/x-7z-compressed': '.7z',
    'application/octet-stream': '.bin',
    'application/vnd.android.package-archive': '.apk',
    'application/x-msdownload': '.exe',
    'application/x-msi': '.msi',
    'application/x-iso9660-image': '.iso',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    'application/vnd.ms-excel': '.xls',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
    'application/vnd.ms-powerpoint': '.ppt',
    'text/plain': '.txt',
    'text/html': '.html',
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'video/mp4': '.mp4',
    'video/x-matroska': '.mkv',
    'audio/mpeg': '.mp3',
    'application/epub+zip': '.epub',
  };
  return map[ct] ?? '';
};

const guessExtensionFromUrl = (url: string) => {
  try {
    const path = new URL(url).pathname;
    const match = path.match(/\.([a-z0-9]+)$/i);
    return match ? `.${match[1]}` : '';
  } catch {
    const match = url.match(/\.([a-z0-9]+)(\?.*)?$/i);
    return match ? `.${match[1]}` : '';
  }
};

const isMissingTicketTableError = (error: { code?: string; message?: string; details?: string; hint?: string } | null | undefined) => {
  if (!error) {
    return false;
  }

  if (error.code === 'PGRST205') {
    return true;
  }

  const text = `${error.message ?? ''} ${error.details ?? ''} ${error.hint ?? ''}`.toLowerCase();
  return text.includes('delivery_download_tickets')
    && (
      text.includes('schema cache')
      || text.includes('relation')
      || text.includes('does not exist')
      || text.includes('could not find the table')
    );
};

async function handleAuth(req: any, res: any, supabase: any, tokenSecret: string) {
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

  if (!email) {
    return res.status(400).json({ ok: false, error: 'Email is required.' });
  }

  if (!serialNo) {
    const latestApproved = await supabase
      .from('verification_orders')
      .select('serial_no')
      .eq('email', email)
      .ilike('email_status', '%review:approved%')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (latestApproved.error || !latestApproved.data?.serial_no) {
      return res.status(403).json({ ok: false, error: 'Order is not approved for delivery yet.' });
    }

    serialNo = String(latestApproved.data.serial_no ?? '').trim().toUpperCase();
  }

  const orderLookup = await supabase
    .from('verification_orders')
    .select('serial_no, email, email_status, products_json')
    .eq('serial_no', serialNo)
    .single();

  if (orderLookup.error || !orderLookup.data) {
    console.log(`[delivery-auth] Order not found for serial: ${serialNo}`);
    return res.status(404).json({ ok: false, error: 'Order record not found for this serial number.' });
  }

  const storedEmail = String(orderLookup.data.email ?? '').trim().toLowerCase();
  if (storedEmail !== email) {
    console.log(`[delivery-auth] Email mismatch for serial ${serialNo}. Input: ${email}, Stored: ${storedEmail}`);
    return res.status(401).json({ ok: false, error: 'The email provided does not match the record for this serial number.' });
  }

  const approvedOrders = await supabase
    .from('verification_orders')
    .select('serial_no, products_json, email_status')
    .eq('email', email)
    .ilike('email_status', '%review:approved%')
    .order('created_at', { ascending: false })
    .limit(300);

  const rejectedOrders = await supabase
    .from('verification_orders')
    .select('serial_no, products_json, email_status')
    .eq('email', email)
    .ilike('email_status', '%review:rejected%')
    .order('created_at', { ascending: false })
    .limit(300);

  if (approvedOrders.error) {
    return res.status(500).json({ ok: false, error: approvedOrders.error.message });
  }
  if (rejectedOrders.error) {
    return res.status(500).json({ ok: false, error: rejectedOrders.error.message });
  }

  const approvedRows = (approvedOrders.data ?? []).filter((row) => isApprovedStatus(String(row.email_status ?? '')));
  const rejectedRows = (rejectedOrders.data ?? []).filter((row) => String(row.email_status ?? '').toLowerCase().includes('review:rejected'));
  const emailStatus = String(orderLookup.data.email_status ?? '');
  const hasApproved = approvedRows.length > 0;
  if (!isApprovedStatus(emailStatus) && !hasApproved) {
    return res.status(403).json({ ok: false, error: 'Order is not approved for delivery yet.' });
  }

  const serialForToken = isApprovedStatus(emailStatus)
    ? serialNo
    : String(approvedRows[0]?.serial_no ?? serialNo).toUpperCase();
  const approvedProducts = aggregateProductsByStatus(approvedRows, 'approved');
  const rejectedProducts = aggregateProductsByStatus(rejectedRows, 'rejected');
  const products = [...approvedProducts, ...rejectedProducts];

  const entitlementLookup = await supabase
    .from('buyer_entitlements')
    .select('email, approved_product_count, download_used, download_limit, is_unlimited')
    .eq('email', email)
    .single();

  const entitlement = entitlementLookup.data as BuyerEntitlement | null;

  const token = signPayload({ email, serialNo: serialForToken }, tokenSecret);

  return res.status(200).json({
    ok: true,
    token,
    serialNo: serialForToken,
    products: products.map((item) => ({
      name: item.name,
      amount: item.amount,
      os: item.os,
      status: item.status,
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
}

async function handleDownload(req: any, res: any, supabase: any, tokenSecret: string, bypassDownloadLimit: boolean) {
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

  const orderLookup = await supabase
    .from('verification_orders')
    .select('id, serial_no, email, email_status')
    .eq('serial_no', tokenPayload.serialNo)
    .ilike('email', tokenPayload.email)
    .single();

  if (orderLookup.error || !orderLookup.data) {
    return res.status(404).json({ ok: false, error: 'Order not found.' });
  }

  const status = String(orderLookup.data.email_status ?? '');
  if (!isApprovedStatus(status)) {
    return res.status(403).json({ ok: false, error: 'Order is not approved yet.' });
  }

  const approvedOrders = await supabase
    .from('verification_orders')
    .select('serial_no, products_json, email_status')
    .eq('email', tokenPayload.email)
    .ilike('email_status', '%review:approved%')
    .order('created_at', { ascending: false })
    .limit(300);

  const rejectedOrders = await supabase
    .from('verification_orders')
    .select('serial_no, products_json, email_status')
    .eq('email', tokenPayload.email)
    .ilike('email_status', '%review:rejected%')
    .order('created_at', { ascending: false })
    .limit(300);

  if (approvedOrders.error) {
    return res.status(500).json({ ok: false, error: approvedOrders.error.message });
  }
  if (rejectedOrders.error) {
    return res.status(500).json({ ok: false, error: rejectedOrders.error.message });
  }

  const approvedRows = (approvedOrders.data ?? []).filter((row) => isApprovedStatus(String(row.email_status ?? '')));
  const rejectedRows = (rejectedOrders.data ?? []).filter((row) => String(row.email_status ?? '').toLowerCase().includes('review:rejected'));
  const approvedProducts = aggregateProductsByStatus(approvedRows, 'approved');
  const rejectedProducts = aggregateProductsByStatus(rejectedRows, 'rejected');
  const products = [...approvedProducts, ...rejectedProducts];

  const entitlementLookup = await supabase
    .from('buyer_entitlements')
    .select('email, approved_product_count, download_used, download_limit, is_unlimited')
    .eq('email', tokenPayload.email)
    .single();

  const entitlement: BuyerEntitlement = entitlementLookup.data ?? {
    email: tokenPayload.email,
    approved_product_count: 0,
    download_used: 0,
    download_limit: 10,
    is_unlimited: false,
  };

  const used = Number(entitlement.download_used ?? 0);
  const limit = Number(entitlement.download_limit ?? 10);
  if (!bypassDownloadLimit && !entitlement.is_unlimited && used >= limit) {
    return res.status(403).json({ ok: false, error: 'Download limit reached. Please contact support.', code: 'DOWNLOAD_LIMIT_REACHED' });
  }

  const normalizedProductName = normalizeForMatch(productName);
  const target = products.find((item) => {
    const itemStatus = String(item.status ?? '').toLowerCase();
    return itemStatus === 'approved' && normalizeForMatch(item.name) === normalizedProductName;
  });

  if (!target) {
    console.error('[delivery-download] product not found in approved list', { 
      productName, 
      normalizedProductName,
      available: products.map(p => p.name) 
    });
    return res.status(404).json({ ok: false, error: 'Selected product is not found in your approved orders.' });
  }

  let targetLink = String(target.fileLink ?? '').trim();
  if (!targetLink) {
    // Try exact ilike match first
    const { data: globalProduct } = await supabase
      .from('products')
      .select('file_url')
      .ilike('name', productName)
      .limit(1)
      .maybeSingle();
      
    if (globalProduct?.file_url) {
      console.log(`[delivery-download] Fallback link (exact ilike) used for ${productName}`);
      targetLink = String(globalProduct.file_url).trim();
    } else {
      // If exact ilike failed (maybe due to spacing), try a broader search or fetch all to match locally
      // Given we only have 5k products and we are in a serverless function, fetching all is too much.
      // Let's try matching with a trimmed/normalized string if it's feasible or just log it.
      console.log(`[delivery-download] No exact link found for ${productName}, trying normalized match...`);
      
      // We can use a trick: search for a product name that contains a significant part of our string
      const partialName = productName.split('(')[0].trim(); // Take part before OS if any
      const { data: possibleProducts } = await supabase
        .from('products')
        .select('name, file_url')
        .ilike('name', `%${partialName}%`)
        .limit(10);
      
      if (possibleProducts && possibleProducts.length > 0) {
        const bestMatch = possibleProducts.find(p => normalizeForMatch(p.name) === normalizedProductName);
        if (bestMatch?.file_url) {
          console.log(`[delivery-download] Fallback link (normalized match) found for ${productName} via partial search`);
          targetLink = String(bestMatch.file_url).trim();
        }
      }
    }
  }

  if (!targetLink) {
    console.error('[delivery-download] No link found after fallbacks for', productName);
    return res.status(400).json({ ok: false, error: 'No delivery link configured yet for this product.' });
  }

  const ticketId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 60 * 1000);
  const sourceUrl = toDirectDownloadLink(targetLink);
  const fileName = sanitizeFileName(target.name);
  const uaHash = getUserAgentHash(req);
  const ipHash = getIpHash(req);

  const insertTicket = await supabase
    .from('delivery_download_tickets')
    .insert({
      ticket_id: ticketId,
      email: tokenPayload.email,
      serial_no: tokenPayload.serialNo,
      product_name: target.name,
      source_url: sourceUrl,
      file_name: fileName,
      expires_at: expiresAt.toISOString(),
    });

  if (insertTicket.error) {
    console.error('[delivery-download] ticket insert failed', {
      code: insertTicket.error.code,
      message: insertTicket.error.message,
      details: insertTicket.error.details,
      hint: insertTicket.error.hint,
    });

    if (isMissingTicketTableError(insertTicket.error)) {
      return res.status(503).json({
        ok: false,
        error: 'Download service is temporarily unavailable. Please try again later.',
        code: 'DOWNLOAD_SERVICE_UNAVAILABLE',
      });
    }

    return res.status(500).json({
      ok: false,
      error: 'Unable to prepare download right now. Please try again.',
      code: 'DOWNLOAD_PREPARE_FAILED',
    });
  }

  const downloadTicket = signDownloadTicket(
    {
      ticketId,
      email: tokenPayload.email,
      serialNo: tokenPayload.serialNo,
      productName: target.name,
      exp: Math.floor(expiresAt.getTime() / 1000),
      uaHash,
      ipHash,
    },
    tokenSecret,
  );

  return res.status(200).json({
    ok: true,
    downloadTicket,
    fileName,
    products: products.map((item) => ({
      name: item.name,
      amount: item.amount,
      os: item.os,
      status: item.status,
    })),
    entitlement: {
      isUnlimited: Boolean(entitlement.is_unlimited),
      downloadUsed: used,
      downloadLimit: limit,
    },
  });
}

async function handleFile(req: any, res: any, supabase: any, tokenSecret: string, bypassDownloadLimit: boolean) {
  const ticket = String(req.query?.ticket ?? '').trim();
  if (!ticket) {
    return res.status(400).send('Missing ticket.');
  }

  const parsed = verifyTicket(ticket, tokenSecret);
  if (!parsed) {
    return res.status(401).send('Invalid or expired ticket.');
  }

  const ticketLookup = await supabase
    .from('delivery_download_tickets')
    .select('ticket_id, email, serial_no, product_name, source_url, file_name, expires_at, used_at')
    .eq('ticket_id', parsed.ticketId)
    .single();

  if (ticketLookup.error) {
    console.error('[delivery-file] ticket lookup failed', {
      code: ticketLookup.error.code,
      message: ticketLookup.error.message,
      details: ticketLookup.error.details,
      hint: ticketLookup.error.hint,
    });
  }

  if (!ticketLookup.data) {
    return res.status(404).send('Ticket not found.');
  }

  const row = ticketLookup.data;
  if (row.used_at) {
    return res.status(409).send('Ticket already used.');
  }

  if (new Date(String(row.expires_at)).getTime() < Date.now()) {
    return res.status(401).send('Ticket expired.');
  }

  if (
    String(row.email).toLowerCase() !== parsed.email.toLowerCase()
    || String(row.serial_no).toUpperCase() !== parsed.serialNo.toUpperCase()
    || String(row.product_name).trim().toLowerCase() !== String(parsed.productName).trim().toLowerCase()
  ) {
    console.error('[delivery-file] ticket mismatch', {
      db: { email: row.email, serial: row.serial_no, product: row.product_name },
      token: { email: parsed.email, serial: parsed.serialNo, product: parsed.productName }
    });
    return res.status(401).send('Ticket mismatch.');
  }

  const requestUaHash = getUserAgentHash(req);
  const requestIpHash = getIpHash(req);
  if (parsed.uaHash && requestUaHash && parsed.uaHash !== requestUaHash) {
    return res.status(401).send('Ticket device mismatch.');
  }
  if (parsed.ipHash && requestIpHash && parsed.ipHash !== requestIpHash) {
    return res.status(401).send('Ticket network mismatch.');
  }

  const entitlementLookup = await supabase
    .from('buyer_entitlements')
    .select('email, approved_product_count, download_used, download_limit, is_unlimited')
    .eq('email', parsed.email)
    .single();

  const entitlement: BuyerEntitlement = entitlementLookup.data ?? {
    email: parsed.email,
    approved_product_count: 0,
    download_used: 0,
    download_limit: 10,
    is_unlimited: false,
  };

  const used = Number(entitlement.download_used ?? 0);
  const limit = Number(entitlement.download_limit ?? 10);
  if (!bypassDownloadLimit && !entitlement.is_unlimited && used >= limit) {
    return res.status(403).send('Download limit reached.');
  }

  const sourceUrl = String(row.source_url ?? '').trim();
  if (!sourceUrl) {
    return res.status(400).send('File source is unavailable.');
  }

  const consumeTicket = await supabase
    .from('delivery_download_tickets')
    .update({ used_at: new Date().toISOString() })
    .eq('ticket_id', parsed.ticketId)
    .is('used_at', null)
    .select('ticket_id')
    .single();

  if (consumeTicket.error || !consumeTicket.data) {
    return res.status(409).send('Ticket already used or expired.');
  }

  if (!entitlement.is_unlimited) {
    await supabase
      .from('buyer_entitlements')
      .upsert({
        email: parsed.email,
        approved_product_count: Number(entitlement.approved_product_count ?? 0),
        download_used: used + 1,
        download_limit: limit,
        is_unlimited: false,
      }, { onConflict: 'email' });
  }
  let upstream = await fetch(sourceUrl, {
    method: 'GET',
    redirect: 'follow',
    headers: {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });

  // Handle Google Drive Large File Confirmation
  const initialContentType = upstream.headers.get('content-type') || '';
  if (sourceUrl.includes('drive.google.com') && initialContentType.includes('text/html')) {
    const htmlText = await upstream.text();
    const confirmMatch = htmlText.match(/confirm=([a-zA-Z0-9_-]+)/);
    if (confirmMatch?.[1]) {
      const confirmedUrl = `${sourceUrl}&confirm=${confirmMatch[1]}`;
      console.log(`[delivery-file] Google Drive large file detected, retrying with confirm token`);
      upstream = await fetch(confirmedUrl, {
        method: 'GET',
        redirect: 'follow',
        headers: {
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });
    } else {
      // Re-create the streamable response if no confirm token found (maybe it's just a small HTML file)
      upstream = new Response(htmlText, {
        status: upstream.status,
        headers: upstream.headers,
      });
    }
  }

  if (!upstream.ok || !upstream.body) {
    return res.status(502).send('Unable to download file right now.');
  }

  const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
  const contentLength = upstream.headers.get('content-length');
  const upstreamDisposition = upstream.headers.get('content-disposition') || '';
  const dispositionName = extractFilenameFromContentDisposition(upstreamDisposition);
  
  const baseName = sanitizeFileName(String(dispositionName || row.file_name || row.product_name || 'digitalmerch-download'));
  const hasExtension = /\.[a-z0-9]{2,8}$/i.test(baseName);
  
  let fileName = baseName;
  if (!hasExtension) {
    const extFromCt = extensionFromContentType(contentType);
    const extFromUrl = guessExtensionFromUrl(sourceUrl);
    
    if (extFromCt && extFromCt !== '.bin') {
      fileName = `${baseName}${extFromCt}`;
    } else if (extFromUrl) {
      fileName = `${baseName}${extFromUrl}`;
    } else {
      const pName = normalizeForMatch(String(row.product_name || ''));
      if (pName.includes('cracked') || pName.includes('setup') || pName.includes('office')) {
        fileName = `${baseName}.zip`;
      } else {
        fileName = `${baseName}.zip`; // Default to .zip instead of .bin
      }
    }
  }

  res.setHeader('Content-Type', contentType);
  if (contentLength) {
    res.setHeader('Content-Length', contentLength);
  }
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.setHeader('Cache-Control', 'no-store, private, max-age=0');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');

  const stream = (upstream.body as any);
  for await (const chunk of stream) {
    res.write(chunk);
  }
  return res.end();
}

export default async function handler(req: any, res: any) {
  const path = req.query?.path ?? '';

  // Always set CORS headers for all responses
  res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
  res.setHeader('Access-Control-Allow-Methods', corsHeaders['Access-Control-Allow-Methods']);
  res.setHeader('Access-Control-Allow-Headers', corsHeaders['Access-Control-Allow-Headers']);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const tokenSecret = process.env.DELIVERY_TOKEN_SECRET ?? supabaseServiceRoleKey;
  const bypassDownloadLimit = String(process.env.BYPASS_DOWNLOAD_LIMIT ?? '').toLowerCase() === 'true';

  if (!supabaseUrl || !supabaseServiceRoleKey || !tokenSecret) {
    return res.status(500).json({ ok: false, error: 'Missing server configuration.' });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    if (path === 'auth') {
      if (req.method !== 'POST') {
        return res.status(405).json({ ok: false, error: 'Method not allowed.' });
      }
      return handleAuth(req, res, supabase, tokenSecret);
    }

    if (path === 'download') {
      if (req.method !== 'POST') {
        return res.status(405).json({ ok: false, error: 'Method not allowed.' });
      }
      return handleDownload(req, res, supabase, tokenSecret, bypassDownloadLimit);
    }

    if (path === 'file') {
      if (req.method !== 'GET') {
        return res.status(405).send('Method not allowed.');
      }
      return handleFile(req, res, supabase, tokenSecret, bypassDownloadLimit);
    }

    return res.status(400).json({ ok: false, error: 'Invalid path. Use auth, download, or file.' });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Unexpected server error' });
  }
}
