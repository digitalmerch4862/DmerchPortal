import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { Resend } from "https://esm.sh/resend@0.16.0"

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const RESEND_FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL')
const DELIVERY_TOKEN_SECRET = Deno.env.get('DELIVERY_TOKEN_SECRET') ?? SUPABASE_SERVICE_ROLE_KEY
const APP_BASE_URL = Deno.env.get('APP_BASE_URL') ?? 'https://paymentportal.digitalmerchs.store'
const MANILA_TIMEZONE = 'Asia/Manila'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const rpcToNumber = (rpcData: unknown) => {
    if (typeof rpcData === 'number') {
        return rpcData
    }
    if (typeof rpcData === 'string') {
        return parseInt(rpcData, 10)
    }
    if (Array.isArray(rpcData) && rpcData.length > 0) {
        const first = rpcData[0]
        const value = typeof first === 'object' && first !== null ? Object.values(first)[0] : first
        if (typeof value === 'number') {
            return value
        }
        if (typeof value === 'string') {
            return parseInt(value, 10)
        }
    }
    return null
}

const getManilaSerialParts = (date: Date) => {
    const shortParts = new Intl.DateTimeFormat('en-US', {
        timeZone: MANILA_TIMEZONE,
        year: 'numeric',
        month: 'short',
        day: '2-digit',
    }).formatToParts(date)

    const getPart = (parts: Intl.DateTimeFormatPart[], type: string) => {
        return parts.find((part) => part.type === type)?.value ?? ''
    }

    const year = getPart(shortParts, 'year')
    const monthShort = getPart(shortParts, 'month').toUpperCase()
    const day = getPart(shortParts, 'day')

    return {
        datePart: `${year}${monthShort}${day}`,
        monthSerialPrefix: `${year}${monthShort}`,
    }
}

const normalizeProductName = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ')

const base64UrlFromBytes = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

const base64UrlFromString = (value: string) => base64UrlFromBytes(new TextEncoder().encode(value))

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

const escapeHtml = (value: string) => value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

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

const buildReadyEmailHtml = ({
    username,
    serialNo,
    accessUrl,
}: {
    username: string;
    serialNo: string;
    accessUrl: string;
}) => `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Segoe UI,Tahoma,Verdana,sans-serif;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%">
    <tr><td style="padding:20px 0;">
      <table align="center" border="0" cellpadding="0" cellspacing="0" width="600" style="background:#fff;border:1px solid #ddd;border-radius:8px;overflow:hidden;">
        <tr><td style="background:#111827;color:#fff;padding:30px 24px;">
          <h2 style="margin:0;font-size:22px;">Your DMerch Purchase is Ready</h2>
        </td></tr>
        <tr><td style="padding:26px 24px;color:#333;line-height:1.6;font-size:14px;">
          <p>Hello <strong>${escapeHtml(username)}</strong>,</p>
          <p>Your verification request has been approved. Use the button below to securely access your downloads.</p>
          <p><strong>Order Serial:</strong> ${escapeHtml(serialNo)}</p>
          <p><a href="${accessUrl}" style="display:inline-block;padding:12px 18px;background:#0284c7;color:#fff;text-decoration:none;border-radius:6px;">Access Your Downloads</a></p>
          <p style="font-size:12px;color:#666;">Use the same email and order serial if prompted for verification.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

const sanitizeProducts = (rawProducts: unknown) => {
    const parsed = Array.isArray(rawProducts) ? rawProducts : []
    return parsed
        .map((item) => {
            const obj = item && typeof item === 'object' ? item as Record<string, unknown> : {}
            const name = String(obj.name ?? '').trim()
            const amount = Number(obj.amount ?? 0)
            if (!name || !Number.isFinite(amount)) {
                return null
            }
            return {
                id: String(obj.id ?? '').trim(),
                name,
                amount,
                os: String(obj.os ?? '').trim(),
                fileLink: String(obj.fileLink ?? '').trim(),
            }
        })
        .filter(Boolean) as Array<{ id: string; name: string; amount: number; os: string; fileLink: string }>
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !RESEND_API_KEY || !RESEND_FROM_EMAIL || !DELIVERY_TOKEN_SECRET) {
            throw new Error('Missing server configuration for freebie fulfillment.')
        }

        const { username, email, products, totalAmount, reference_no } = await req.json()
        const normalizedEmail = String(email ?? '').trim().toLowerCase()
        const normalizedUsername = String(username ?? '').trim() || 'Customer'
        const normalizedProducts = sanitizeProducts(products)
        const numericTotalAmount = Number(totalAmount ?? 0)

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
        const resend = new Resend(RESEND_API_KEY)

        if (!normalizedEmail) {
            throw new Error('Customer email is required.')
        }
        if (normalizedProducts.length === 0) {
            throw new Error('At least one product is required.')
        }
        if (!Number.isFinite(numericTotalAmount) || numericTotalAmount !== 0) {
            throw new Error('This endpoint only handles freebie claims.')
        }

        const sequenceResponse = await supabase.rpc('next_verification_sequence')
        const sequenceNo = rpcToNumber(sequenceResponse.data)
        if (sequenceResponse.error || sequenceNo === null || Number.isNaN(sequenceNo)) {
            throw new Error(sequenceResponse.error?.message ?? 'Could not generate order sequence.')
        }

        const now = new Date()
        const { datePart, monthSerialPrefix } = getManilaSerialParts(now)
        const monthLookupPattern = `DMERCH-${monthSerialPrefix}%`
        const monthlySerialLookup = await supabase
            .from('verification_orders')
            .select('serial_no')
            .like('serial_no', monthLookupPattern)

        if (monthlySerialLookup.error) {
            throw new Error(monthlySerialLookup.error.message)
        }

        const monthlySerialRegex = new RegExp(`^DMERCH-${escapeRegex(monthSerialPrefix)}\\d{2}-(\\d+)$`)
        let maxMonthlySuffix = 0
        for (const row of monthlySerialLookup.data ?? []) {
            const serial = String((row as any).serial_no ?? '')
            const match = serial.match(monthlySerialRegex)
            if (!match) {
                continue
            }
            const numeric = Number(match[1])
            if (!Number.isNaN(numeric)) {
                maxMonthlySuffix = Math.max(maxMonthlySuffix, numeric)
            }
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

        const productsWithLinks = normalizedProducts.map((item) => ({
            ...item,
            fileLink: item.fileLink || productLinkMap.get(normalizeProductName(item.name)) || '',
        }))

        const referenceNo = String(reference_no ?? `FREE-${Date.now().toString().slice(-6)}`).trim().toUpperCase()
        const initialStatus = 'payment:free | review:approved | customer:pending_send | payment:auto_approved | source:freebie'

        let serialNo = ''
        let insertedOrderId = ''
        const maxInsertAttempts = 6
        for (let attempt = 0; attempt < maxInsertAttempts; attempt += 1) {
            const nextSuffix = maxMonthlySuffix + 1 + attempt
            const serialCandidate = `DMERCH-${datePart}-${String(nextSuffix).padStart(3, '0')}`

            const insertResponse = await supabase
                .from('verification_orders')
                .insert({
                    sequence_no: sequenceNo,
                    serial_no: serialCandidate,
                    username: normalizedUsername,
                    email: normalizedEmail,
                    product_name: productsWithLinks[0].name,
                    amount: 0,
                    products_json: productsWithLinks,
                    total_amount: 0,
                    reference_no: referenceNo,
                    payment_portal_used: 'freebie_claim',
                    payment_detail_used: 'free_auto',
                    email_status: initialStatus,
                    payment_status: 'paid',
                    paid_at: new Date().toISOString(),
                })
                .select('id')
                .single()

            if (!insertResponse.error) {
                serialNo = serialCandidate
                insertedOrderId = String(insertResponse.data.id)
                break
            }

            const isSerialConflict = insertResponse.error.code === '23505'
                && ((insertResponse.error.message ?? '').toLowerCase().includes('serial_no')
                    || (insertResponse.error.details ?? '').toLowerCase().includes('serial_no'))

            if (!isSerialConflict) {
                throw new Error(insertResponse.error.message)
            }
        }

        if (!serialNo || !insertedOrderId) {
            throw new Error('Could not generate monthly purchase code sequence. Please retry.')
        }

        const token = await createToken({ email: normalizedEmail, serialNo }, DELIVERY_TOKEN_SECRET)
        const accessUrl = `${APP_BASE_URL}/delivery?access=${encodeURIComponent(token)}`

        const html = buildReadyEmailHtml({
            username: normalizedUsername,
            serialNo,
            accessUrl,
        })

        let customerStatus = 'customer:sent'
        try {
            await resend.emails.send({
                from: RESEND_FROM_EMAIL,
                to: normalizedEmail,
                subject: `DMerch Purchase Ready (${serialNo})`,
                html,
            })
        } catch (error) {
            const reason = error instanceof Error ? error.message : 'unknown_email_error'
            customerStatus = `customer:failed:${reason}`
        }

        const finalStatus = appendStatusTag(initialStatus, customerStatus)
        await supabase
            .from('verification_orders')
            .update({ email_status: finalStatus })
            .eq('id', insertedOrderId)

        return new Response(JSON.stringify({ ok: true, serialNo, status: customerStatus }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    } catch (error: any) {
        console.error('Freebie Claim Error:', error?.message ?? error)
        return new Response(JSON.stringify({ error: error?.message ?? 'Unknown freebie claim error' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }
})
