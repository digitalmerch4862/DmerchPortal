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
  // Try to find the download link in various formats
  // We decode common HTML entities first
  const decodedHtml = html.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

  const patterns = [
    /https:\/\/drive\.usercontent\.google\.com\/download[^"'\s]+/i,
    /https:\/\/drive\.google\.com\/uc\?id=[^&]+&export=download&confirm=[^"'\s&]+/i,
    /https:\/\/drive\.google\.com\/u\/[0-9]+\/uc\?id=[^&]+&export=download&confirm=[^"'\s&]+/i,
    /href="([^"]*confirm=[^"]*)"/i,
    /confirm=([^"&\s<>\|]+)/i,
    /id="uc-download-link" href="([^"]+)"/i,
    /action="([^"]*confirm=[^"]*)"/i
  ];

  for (const pattern of patterns) {
    const match = decodedHtml.match(pattern);
    if (match) {
      let url = match[1] || match[0];
      if (url.startsWith('/')) {
        url = new URL(url, baseUrl).toString();
      }
      // If it's just the confirm code, we need to rebuild the URL
      if (url.length < 20 && !url.includes('http')) {
        const idMatch = baseUrl.match(/id=([a-zA-Z0-9_-]+)/);
        if (idMatch) {
          return `https://drive.google.com/uc?id=${idMatch[1]}&export=download&confirm=${url}`;
        }
      }
      return url;
    }
  }

  return '';
};

const fetchDownloadStream = async (sourceUrl: string) => {
  let response = await fetch(sourceUrl, {
    redirect: 'follow',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    }
  });

  const contentType = String(response.headers.get('content-type') ?? '').toLowerCase();

  // If it's a small HTML page, it might be a Google Drive warning page
  if (contentType.includes('text/html')) {
    const html = await response.text();
    const confirmUrl = extractGoogleConfirmUrl(html, sourceUrl);
    if (confirmUrl) {
      console.log('[delivery-file] found Google confirmation URL, retrying...');
      // Combine all set-cookie headers
      const cookies = response.headers.get('set-cookie') || '';

      return fetch(confirmUrl, {
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Referer': sourceUrl,
          'Cookie': cookies
        }
      });
    }
    // If it's HTML but not a confirmation page, it might be an error or a tiny file
    return new Response(html, { status: response.status, headers: response.headers });
  }

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
    || String(row.product_name).trim().toLowerCase() !== String(parsed.productName).trim().toLowerCase()
  ) {
    console.error('[delivery-file] ticket mismatch', {
      db: { email: row.email, serial: row.serial_no, product: row.product_name },
      token: { email: parsed.email, serial: parsed.serialNo, product: parsed.productName }
    });
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
    const errorText = await sourceResponse.text().catch(() => '');
    console.error('[delivery-file] Source fetch failed:', {
      status: sourceResponse.status,
      text: errorText.substring(0, 500),
      url: sourceUrl
    });
    return res.status(502).send(`Error: Service could not retrieve the file (Status ${sourceResponse.status}). Please refresh and try again.`);
  }

  // If we still have HTML at this point, even after our retry logic in fetchDownloadStream, it's likely a persistent error page.
  const sourceContentType = String(sourceResponse.headers.get('content-type') ?? '').toLowerCase();
  if (sourceContentType.includes('text/html')) {
    const htmlSnippet = await sourceResponse.text().catch(() => '');
    console.error('[delivery-file] Persistent HTML response from source:', htmlSnippet.substring(0, 500));
    return res.status(502).send('Error: Google Drive prevented a direct download. This can happen if the file is restricted or the quota is exceeded. Please message us on Facebook.');
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
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (!sourceResponse.body) {
    console.error('[delivery-file] source body null');
    return res.status(502).send('Source produced no body.');
  }

  try {
    const reader = (sourceResponse.body as any).getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
  } catch (err: any) {
    console.error('[delivery-file] stream error:', err.message);
    if (!res.writableEnded) res.end();
  }
}
