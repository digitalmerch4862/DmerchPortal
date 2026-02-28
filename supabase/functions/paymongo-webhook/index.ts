import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { Resend } from "https://esm.sh/resend@0.16.0"
import { fulfillOrder } from "../_shared/fulfillment.ts"

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

serve(async (req) => {
    try {
        const payload = await req.json()
        const eventType = payload.data.attributes.type

        if (eventType === 'checkout_session.payment.paid') {
            const checkoutSession = payload.data.attributes.data
            const metadata = checkoutSession.attributes.metadata
            const referenceNo = metadata.reference_no
            const customerEmail = checkoutSession.attributes.customer_email || metadata.email
            const customerName = checkoutSession.attributes.billing?.name || metadata.name || 'Customer'

            const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
            const resend = new Resend(RESEND_API_KEY)

            // 1. Update verification_orders table
            const { error: updateError } = await supabase
                .from('verification_orders')
                .update({
                    payment_status: 'paid',
                    payment_portal_used: 'paymongo',
                    paid_at: new Date().toISOString()
                })
                .eq('reference_no', referenceNo)

            if (updateError) throw updateError

            // 2. Trigger Automated Fulfillment
            console.log(`Payment confirmed for order: ${referenceNo}. Triggering automated fulfillment...`)
            await fulfillOrder(supabase, resend, referenceNo, customerEmail, customerName)
        }

        return new Response(JSON.stringify({ ok: true }), {
            headers: { 'Content-Type': 'application/json' }
        })
    } catch (error) {
        console.error('Webhook Error:', error.message)
        return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        })
    }
})
