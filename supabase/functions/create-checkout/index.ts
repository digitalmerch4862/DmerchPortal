import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const PAYMONGO_LIVE_SECRET_KEY = Deno.env.get('PAYMONGO_LIVE_SECRET_KEY')
const PAYMONGO_TEST_SECRET_KEY = Deno.env.get('PAYMONGO_TEST_SECRET_KEY')

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

const normalizeBaseUrl = (value: string) => value.trim().replace(/\/+$/, '')

const sanitizeProducts = (rawProducts: unknown, fallbackDescription: string, fallbackAmount: number) => {
  const parsed = Array.isArray(rawProducts) ? rawProducts : []
  const products = parsed
    .map((item) => {
      const obj = item && typeof item === 'object' ? item as Record<string, unknown> : {}
      const name = String(obj.name ?? '').trim()
      const amount = Number(obj.amount ?? 0)
      if (!name || !Number.isFinite(amount) || amount < 0) {
        return null
      }
      return {
        id: String(obj.id ?? '').trim(),
        name,
        amount,
      }
    })
    .filter(Boolean) as Array<{ id: string; name: string; amount: number }>

  if (products.length > 0) {
    return products
  }

  return [{
    id: '',
    name: fallbackDescription || 'Digital Product',
    amount: fallbackAmount,
  }]
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Supabase service credentials are missing.')
    }

    const payload = await req.json()
    const amount = Number(payload.amount ?? 0)
    const description = String(payload.description ?? 'DigitalMerch Order').trim()
    const email = String(payload.email ?? '').trim().toLowerCase()
    const name = String(payload.name ?? '').trim() || 'Customer'
    const metadata = payload.metadata && typeof payload.metadata === 'object' ? payload.metadata as Record<string, unknown> : {}
    const useTestMode = Boolean(payload.useTestMode)
    const returnUrl = normalizeBaseUrl(String(payload.returnUrl ?? 'https://paymentportal.digitalmerchs.store'))

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Amount must be greater than zero.')
    }
    if (!email) {
      throw new Error('Customer email is required.')
    }

    const secretKey = useTestMode ? PAYMONGO_TEST_SECRET_KEY : PAYMONGO_LIVE_SECRET_KEY
    if (!secretKey) {
      throw new Error(`PayMongo ${useTestMode ? 'TEST' : 'LIVE'} Secret Key is not configured.`)
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
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

    const products = sanitizeProducts(payload.products, description, amount)
    const referenceNo = String(metadata.reference_no ?? `DM-${Date.now().toString().slice(-6)}`).trim().toUpperCase()

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
          username: name,
          email,
          product_name: products[0].name,
          amount,
          products_json: products,
          total_amount: amount,
          reference_no: referenceNo,
          payment_portal_used: 'paymongo',
          payment_detail_used: useTestMode ? 'paymongo_test' : 'paymongo_live',
          email_status: 'review:pending_payment',
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

    const cleanMetadata: Record<string, string> = {
      serial_no: serialNo,
      reference_no: referenceNo,
      email,
      name,
      is_admin_test: String(useTestMode),
    }
    for (const [key, value] of Object.entries(metadata)) {
      const k = String(key ?? '').trim()
      const v = String(value ?? '').trim()
      if (k && v) {
        cleanMetadata[k] = v
      }
    }

    const successUrl = `${returnUrl}/?payment=success&serial=${encodeURIComponent(serialNo)}`
    const cancelUrl = `${returnUrl}/?payment=cancelled&serial=${encodeURIComponent(serialNo)}`

    const sessionBody = {
      data: {
        attributes: {
          send_email_receipt: true,
          show_description: true,
          show_line_items: true,
          customer_email: email,
          description: description || 'DigitalMerch Order',
          line_items: [
            {
              amount: Math.round(amount * 100),
              currency: 'PHP',
              description: description || 'DigitalMerch Digital Product',
              name: description || 'Digital Product',
              quantity: 1,
            },
          ],
          payment_method_types: ['gcash', 'paymaya', 'grab_pay', 'card', 'dob', 'dob_ubp'],
          success_url: successUrl,
          cancel_url: cancelUrl,
          metadata: cleanMetadata,
        },
      },
    }

    const response = await fetch('https://api.paymongo.com/v1/checkout_sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${btoa(secretKey + ':')}`,
      },
      body: JSON.stringify(sessionBody),
    })

    const data = await response.json()
    if (!response.ok) {
      await supabase
        .from('verification_orders')
        .update({ email_status: 'payment:init_failed' })
        .eq('id', insertedOrderId)
      throw new Error(data.errors?.[0]?.detail || JSON.stringify(data))
    }

    return new Response(
      JSON.stringify({
        checkout_url: data.data.attributes.checkout_url,
        serial_no: serialNo,
        reference_no: referenceNo,
        mode: useTestMode ? 'test' : 'live',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    console.error('create-checkout error:', error instanceof Error ? error.message : error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unexpected checkout error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
    )
  }
})
