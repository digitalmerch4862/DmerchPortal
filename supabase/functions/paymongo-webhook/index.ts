import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { Resend } from "https://esm.sh/resend@0.16.0"

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const RESEND_FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL')
const DELIVERY_TOKEN_SECRET = Deno.env.get('DELIVERY_TOKEN_SECRET') ?? SUPABASE_SERVICE_ROLE_KEY
const APP_BASE_URL = Deno.env.get('APP_BASE_URL') ?? 'https://paymentportal.digitalmerchs.store'

const base64UrlFromBytes = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=+$/, '')

const base64UrlFromString = (value: string) => base64UrlFromBytes(new TextEncoder().encode(value))

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')

const formatPhpAmount = (amount: number) => `PHP ${Number(amount || 0).toFixed(2)}`

const appendStatusTag = (currentStatus: string, tag: string) => {
  const parts = String(currentStatus ?? '')
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean)
  if (!parts.includes(tag)) {
    parts.push(tag)
  }
  return parts.join(' | ')
}

const isApprovedStatus = (status: string) => status.toLowerCase().includes('review:approved')

const normalizeProductName = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ')

const getDistinctApprovedProductCount = (rows: Array<{ products_json: unknown }>) => {
  const distinct = new Set<string>()
  for (const row of rows) {
    const products = Array.isArray(row.products_json) ? row.products_json : []
    for (const item of products as Array<{ name?: unknown }>) {
      const name = String(item?.name ?? '').trim().toLowerCase()
      if (name) {
        distinct.add(name)
      }
    }
  }
  return distinct.size
}

const createToken = async (payload: object, secret: string) => {
  const encoded = base64UrlFromString(JSON.stringify(payload))
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(encoded))
  const signature = base64UrlFromBytes(new Uint8Array(signatureBuffer))
  return `${encoded}.${signature}`
}

const buildReadyEmailHtml = ({
  username,
  serialNo,
  products,
  totalAmount,
  accessUrl,
}: {
  username: string;
  serialNo: string;
  products: Array<{ name: string; amount: number }>;
  totalAmount: number;
  accessUrl: string;
}) => {
  const productRows = products.length > 0
    ? products
      .map((item) => `
        <tr>
          <td style="font-size:14px;border-bottom:1px solid #eeeeee;padding:10px 12px;">${escapeHtml(item.name)}</td>
          <td align="right" style="font-size:14px;border-bottom:1px solid #eeeeee;padding:10px 12px;">${formatPhpAmount(item.amount)}</td>
        </tr>`)
      .join('')
    : `
      <tr>
        <td colspan="2" style="font-size:14px;border-bottom:1px solid #eeeeee;padding:10px 12px;color:#6b7280;">Digital products are being finalized.</td>
      </tr>`

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Segoe UI,Tahoma,Verdana,sans-serif;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%">
    <tr><td style="padding:20px 0;">
      <table align="center" border="0" cellpadding="0" cellspacing="0" width="600" style="background:#fff;border:1px solid #ddd;border-radius:8px;overflow:hidden;">
        <tr><td style="background:#0f172a;color:#fff;padding:30px 24px;">
          <h2 style="margin:0;font-size:22px;">Your DMerch Purchase is Ready</h2>
          <p style="margin:8px 0 0;font-size:13px;opacity:0.9;">Payment confirmed and auto-approved</p>
        </td></tr>
        <tr><td style="padding:24px;color:#333;line-height:1.6;font-size:14px;">
          <p>Hello <strong>${escapeHtml(username)}</strong>,</p>
          <p>Your payment is successful and your order has been automatically approved.</p>
          <p><strong>Order Serial:</strong> ${escapeHtml(serialNo)}</p>

          <table border="0" cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #eeeeee;border-radius:6px;overflow:hidden;margin-top:14px;">
            <thead>
              <tr style="background:#fafafa;">
                <th align="left" style="font-size:12px;color:#6b7280;padding:10px 12px;border-bottom:2px solid #eeeeee;">PRODUCT DESCRIPTION</th>
                <th align="right" style="font-size:12px;color:#6b7280;padding:10px 12px;border-bottom:2px solid #eeeeee;">AMOUNT</th>
              </tr>
            </thead>
            <tbody>
              ${productRows}
              <tr style="background:#fcfcfc;">
                <td align="right" style="font-size:14px;font-weight:700;padding:10px 12px;">Total Paid</td>
                <td align="right" style="font-size:15px;font-weight:700;padding:10px 12px;">${formatPhpAmount(totalAmount)}</td>
              </tr>
            </tbody>
          </table>

          <p style="margin-top:20px;">
            <a href="${accessUrl}" style="display:inline-block;padding:12px 18px;background:#0284c7;color:#fff;text-decoration:none;border-radius:6px;">Access Your Downloads</a>
          </p>
          <p style="font-size:12px;color:#666;">Use the same email and order serial if prompted for verification.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

serve(async (req) => {
  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !RESEND_API_KEY || !RESEND_FROM_EMAIL || !DELIVERY_TOKEN_SECRET) {
      throw new Error('Missing server configuration for webhook fulfillment.')
    }

    const payload = await req.json()
    const eventType = String(payload?.data?.attributes?.type ?? '')
    if (eventType !== 'checkout_session.payment.paid') {
      return new Response(JSON.stringify({ ok: true, ignored: eventType || 'unknown_event' }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const checkoutSession = payload?.data?.attributes?.data
    const metadata = checkoutSession?.attributes?.metadata ?? {}
    const serialNo = String(metadata.serial_no ?? '').trim().toUpperCase()
    const referenceNo = String(metadata.reference_no ?? '').trim().toUpperCase()
    const customerEmail = String(checkoutSession?.attributes?.customer_email ?? metadata.email ?? '').trim().toLowerCase()
    const customerName = String(checkoutSession?.attributes?.billing?.name ?? metadata.name ?? 'Customer').trim() || 'Customer'
    const checkoutSessionId = String(checkoutSession?.id ?? '').trim()

    if (!serialNo && !referenceNo) {
      throw new Error('Webhook payload is missing serial_no/reference_no metadata.')
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const resend = new Resend(RESEND_API_KEY)

    let lookup = await supabase
      .from('verification_orders')
      .select('id, serial_no, username, email, total_amount, products_json, email_status, reference_no')
      .eq('serial_no', serialNo)
      .limit(1)

    if ((!lookup.data || lookup.data.length === 0) && referenceNo) {
      lookup = await supabase
        .from('verification_orders')
        .select('id, serial_no, username, email, total_amount, products_json, email_status, reference_no')
        .eq('reference_no', referenceNo)
        .limit(1)
    }

    const order = lookup.data?.[0]
    if (!order) {
      throw new Error(`Order not found for serial ${serialNo || 'N/A'} / reference ${referenceNo || 'N/A'}.`)
    }

    const currentStatus = String(order.email_status ?? '')
    const alreadyFulfilled = currentStatus.toLowerCase().includes('review:approved') && currentStatus.toLowerCase().includes('customer:sent')
    if (alreadyFulfilled) {
      return new Response(JSON.stringify({ ok: true, status: 'already_fulfilled' }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const productLookup = await supabase
      .from('products')
      .select('name, file_url')

    const productLinkMap = new Map<string, string>()
    if (!productLookup.error) {
      for (const row of productLookup.data ?? []) {
        const key = normalizeProductName(String((row as any).name ?? ''))
        const fileUrl = String((row as any).file_url ?? '').trim()
        if (key && fileUrl && !productLinkMap.has(key)) {
          productLinkMap.set(key, fileUrl)
        }
      }
    }

    const rawProducts = Array.isArray(order.products_json) ? order.products_json : []
    const updatedProducts = rawProducts.map((item: any) => {
      const name = String(item?.name ?? '').trim()
      const fallback = String(item?.fileLink ?? '').trim()
      const resolved = fallback || productLinkMap.get(normalizeProductName(name)) || ''
      return {
        ...item,
        fileLink: resolved,
      }
    })

    const paidStatus = appendStatusTag(currentStatus, 'payment:paid')
    const approvedStatus = appendStatusTag(appendStatusTag(paidStatus, 'review:approved'), 'inbox:archived')
    const nextStatus = appendStatusTag(approvedStatus, 'customer:pending_send')

    const baseEmail = String(order.email ?? '').trim().toLowerCase()
    const finalEmail = baseEmail || customerEmail
    const finalName = String(order.username ?? '').trim() || customerName
    const finalSerial = String(order.serial_no ?? '').trim().toUpperCase() || serialNo

    const updatePayload: Record<string, unknown> = {
      payment_portal_used: 'paymongo',
      email_status: nextStatus,
      products_json: updatedProducts,
      payment_status: 'paid',
      paid_at: new Date().toISOString(),
    }
    if (checkoutSessionId) {
      updatePayload.paymongo_checkout_id = checkoutSessionId
    }

    let { error: updateError } = await supabase
      .from('verification_orders')
      .update(updatePayload)
      .eq('id', order.id)

    if (updateError && String(updateError.message ?? '').toLowerCase().includes('column')) {
      const fallbackPayload: Record<string, unknown> = {
        payment_portal_used: 'paymongo',
        email_status: nextStatus,
        products_json: updatedProducts,
      }
      const fallback = await supabase
        .from('verification_orders')
        .update(fallbackPayload)
        .eq('id', order.id)
      updateError = fallback.error
    }

    if (updateError) {
      throw updateError
    }

    const approvedLookup = await supabase
      .from('verification_orders')
      .select('products_json, email_status')
      .eq('email', finalEmail)
      .ilike('email_status', '%review:approved%')
      .limit(500)

    if (!approvedLookup.error) {
      const approvedRows = (approvedLookup.data ?? []).filter((row: any) => isApprovedStatus(String(row.email_status ?? '')))
      const approvedProductCount = getDistinctApprovedProductCount(approvedRows)
      const isUnlimited = approvedProductCount >= 3

      await supabase
        .from('buyer_entitlements')
        .upsert({
          email: finalEmail,
          approved_product_count: approvedProductCount,
          download_limit: 10,
          download_used: 0,
          is_unlimited: isUnlimited,
        }, { onConflict: 'email' })
    }

    const token = await createToken({ email: finalEmail, serialNo: finalSerial }, DELIVERY_TOKEN_SECRET)
    const accessUrl = `${APP_BASE_URL}/delivery?access=${encodeURIComponent(token)}`
    const orderProducts = updatedProducts.map((item: any) => ({
      name: String(item?.name ?? '').trim() || 'Digital Product',
      amount: Number(item?.amount ?? 0),
    }))

    const html = buildReadyEmailHtml({
      username: finalName,
      serialNo: finalSerial,
      products: orderProducts,
      totalAmount: Number(order.total_amount ?? 0),
      accessUrl,
    })

    let customerStatus = 'customer:sent'
    try {
      await resend.emails.send({
        from: RESEND_FROM_EMAIL,
        to: finalEmail,
        subject: `DMerch Purchase Ready (${finalSerial})`,
        html,
      })
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown_email_error'
      customerStatus = `customer:failed:${reason}`
    }

    const finalizedStatus = appendStatusTag(appendStatusTag(approvedStatus, customerStatus), 'payment:auto_approved')
    await supabase
      .from('verification_orders')
      .update({ email_status: finalizedStatus })
      .eq('id', order.id)

    return new Response(JSON.stringify({ ok: true, serialNo: finalSerial, status: customerStatus }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Webhook Error:', error instanceof Error ? error.message : error)
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown webhook error' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
