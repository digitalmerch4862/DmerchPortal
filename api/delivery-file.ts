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

  // Redirect to the actual source URL (e.g., Google Drive)
  res.writeHead(302, { Location: sourceUrl });
  return res.end();
}
