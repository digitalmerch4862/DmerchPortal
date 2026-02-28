import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { Resend } from "https://esm.sh/resend@0.16.0"
import { fulfillOrder } from "../_shared/fulfillment.ts"

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { username, email, products, totalAmount, reference_no } = await req.json()

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
        const resend = new Resend(RESEND_API_KEY)

        // 1. Double check amount is actually 0 for security (or it's a known admin)
        if (totalAmount !== 0) {
            throw new Error('This endpoint only handles freebie claims.')
        }

        // 2. Create the order record
        const { error: insertError } = await supabase
            .from('verification_orders')
            .insert({
                username,
                email,
                products_json: products,
                total_amount: 0,
                reference_no: reference_no,
                payment_status: 'paid',
                payment_portal_used: 'freebie_claim',
                paid_at: new Date().toISOString()
            })

        if (insertError) throw insertError

        // 3. Trigger immediate fulfillment
        console.log(`Freebie claim processed for: ${reference_no}. Triggering fulfillment...`)
        await fulfillOrder(supabase, resend, reference_no, email, username)

        return new Response(JSON.stringify({ ok: true, message: 'Freebie claimed and fulfillment sent.' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    } catch (error) {
        console.error('Freebie Claim Error:', error.message)
        return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }
})
