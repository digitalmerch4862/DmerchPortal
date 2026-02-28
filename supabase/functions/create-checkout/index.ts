import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const PAYMONGO_LIVE_SECRET_KEY = Deno.env.get('PAYMONGO_LIVE_SECRET_KEY')
const PAYMONGO_TEST_SECRET_KEY = Deno.env.get('PAYMONGO_TEST_SECRET_KEY')

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { amount, description, email, name, metadata, useTestMode } = await req.json()

        // Determine which key to use
        const secretKey = useTestMode ? PAYMONGO_TEST_SECRET_KEY : PAYMONGO_LIVE_SECRET_KEY;

        if (!secretKey) {
            throw new Error(`PayMongo ${useTestMode ? 'TEST' : 'LIVE'} Secret Key is not configured.`);
        }

        const response = await fetch('https://api.paymongo.com/v1/checkout_sessions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${btoa(secretKey + ':')}`
            },
            body: JSON.stringify({
                data: {
                    attributes: {
                        send_email_receipt: true,
                        show_description: true,
                        show_line_items: true,
                        description: description || "DigitalMerch Order",
                        line_items: [
                            {
                                amount: Math.round(amount * 100),
                                currency: 'PHP',
                                description: description || "DigitalMerch Digital Product",
                                name: description || "Digital Product",
                                quantity: 1
                            }
                        ],
                        payment_method_types: ['gcash', 'paymaya', 'grab_pay', 'card', 'dob', 'dob_ubp'],
                        metadata: metadata || {}
                    }
                }
            })
        })

        const data = await response.json()

        if (!response.ok) {
            throw new Error(data.errors?.[0]?.detail || 'PayMongo API Error')
        }

        return new Response(
            JSON.stringify({
                checkout_url: data.data.attributes.checkout_url,
                mode: useTestMode ? 'test' : 'live'
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    } catch (error) {
        return new Response(
            JSON.stringify({ error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
    }
})
