import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

type BuyerEntitlement = {
  email: string;
  approved_product_count: number;
  download_used: number;
  download_limit: number;
  is_unlimited: boolean;
};

type TicketPayload = {
  ticketId: string;
  email: string;
  serialNo: string;
  productName: string;
  exp: number;
};

const verifyTicket = (ticket: string, secret: string): TicketPayload | null => {
  const [encodedPayload, signature] = ticket.split('.');
  if (!encodedPayload || !signature) {
    return null;
  }

  const expected = crypto.createHmac('sha256', secret).update(encodedPayload).digest('base64url');
  if (signature !== expected) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as TicketPayload;
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

const pickFilename = (contentDisposition: string | null, fallback: string) => {
  if (!contentDisposition) {
    return fallback;
  }

  const utfMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utfMatch && utfMatch[1]) {
    try {
      return decodeURIComponent(utfMatch[1]);
    } catch {
      return utfMatch[1];
    }
  }

  const quoted = contentDisposition.match(/filename="([^"]+)"/i);
  if (quoted && quoted[1]) {
    return quoted[1];
  }

  const plain = contentDisposition.match(/filename=([^;]+)/i);
  if (plain && plain[1]) {
    return plain[1].trim();
  }

  return fallback;
};

const extractGoogleConfirmUrl = (html: string, baseUrl: string) => {
  const decodedHtml = html.replace(/&amp;/g, '&');

  const fullMatch = decodedHtml.match(/https:\/\/drive\.usercontent\.google\.com\/download[^"'\s]+/i);
  if (fullMatch && fullMatch[0]) {
    return fullMatch[0];
  }

  const hrefMatch = decodedHtml.match(/href="([^"]*confirm=[^"]*)"/i);
  if (hrefMatch && hrefMatch[1]) {
    return new URL(hrefMatch[1], baseUrl).toString();
  }

  return '';
};

const fetchDownloadStream = async (sourceUrl: string) => {
  let response = await fetch(sourceUrl, { redirect: 'follow' });
  const contentType = String(response.headers.get('content-type') ?? '').toLowerCase();

  if (!contentType.includes('text/html')) {
    return response;
  }

  const html = await response.text();
  const confirmUrl = extractGoogleConfirmUrl(html, sourceUrl);
  if (!confirmUrl) {
    return new Response('Remote file host blocked direct download.', { status: 502, headers: { 'Content-Type': 'text/plain' } });
  }

  const cookie = response.headers.get('set-cookie');
  response = await fetch(confirmUrl, {
    redirect: 'follow',
    headers: cookie ? { cookie } : undefined,
  });

  return response;
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

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).send('Method not allowed.');
  }

  const ticket = String(req.query?.ticket ?? '').trim();
  if (!ticket) {
    return res.status(400).send('Missing ticket.');
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const tokenSecret = process.env.DELIVERY_TOKEN_SECRET ?? supabaseServiceRoleKey;
  const bypassDownloadLimit = String(process.env.BYPASS_DOWNLOAD_LIMIT ?? '').toLowerCase() === 'true';

  if (!supabaseUrl || !supabaseServiceRoleKey || !tokenSecret) {
    return res.status(500).send('Missing server configuration.');
  }

  const parsed = verifyTicket(ticket, tokenSecret);
  if (!parsed) {
    return res.status(401).send('Invalid or expired ticket.');
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

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

    if (isMissingTicketTableError(ticketLookup.error)) {
      return res.status(503).send('Download service is temporarily unavailable. Please try again later.');
    }
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
    || String(row.product_name) !== parsed.productName
  ) {
    return res.status(401).send('Ticket mismatch.');
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

  const sourceResponse = await fetchDownloadStream(sourceUrl);
  if (!sourceResponse.ok) {
    return res.status(502).send('Could not fetch file from source.');
  }

  const consumeTicket = await supabase
    .from('delivery_download_tickets')
    .update({ used_at: new Date().toISOString() })
    .eq('ticket_id', parsed.ticketId)
    .is('used_at', null)
    .select('ticket_id')
    .single();

  if (consumeTicket.error) {
    console.error('[delivery-file] consume ticket failed', {
      code: consumeTicket.error.code,
      message: consumeTicket.error.message,
      details: consumeTicket.error.details,
      hint: consumeTicket.error.hint,
    });

    if (isMissingTicketTableError(consumeTicket.error)) {
      return res.status(503).send('Download service is temporarily unavailable. Please try again later.');
    }
  }

  if (!consumeTicket.data) {
    return res.status(409).send('Ticket already consumed.');
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

  const contentType = sourceResponse.headers.get('content-type') || 'application/octet-stream';
  const fallbackFileName = String(row.file_name ?? 'digitalmerch-download.bin');
  const fileName = pickFilename(sourceResponse.headers.get('content-disposition'), fallbackFileName).replace(/[\r\n"]/g, '').trim() || fallbackFileName;

  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');

  // Stream the response directly from the source to the client
  if (!sourceResponse.body) {
    return res.status(502).send('Source produced no body.');
  }

  // Use the native Web Streams API to pipe to the Node.js response
  const reader = sourceResponse.body.getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    res.write(value);
  }

  return res.end();
}
