import { createClient } from '@supabase/supabase-js';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

export default async function handler(req: any, res: any) {
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
        res.setHeader('Access-Control-Allow-Methods', corsHeaders['Access-Control-Allow-Methods']);
        res.setHeader('Access-Control-Allow-Headers', corsHeaders['Access-Control-Allow-Headers']);
        return res.status(204).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }

    const pmSecret = process.env.PAYMONGO_SECRET_KEY;
    const pmSecretLive = process.env.PAYMONGO_LIVE_SECRET_KEY;
    const sbUrl = process.env.SUPABASE_URL;
    const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!pmSecret || !pmSecretLive || !sbUrl || !sbKey) {
        console.error('[PayMongo Create] Configuration Missing:', {
            hasPm: !!pmSecret,
            hasPmLive: !!pmSecretLive,
            hasSbUrl: !!sbUrl,
            hasSbKey: !!sbKey
        });
        return res.status(500).json({ ok: false, error: 'Server configuration missing. Please check ENV variables.' });
    }

    try {
        const { amount, email, name, username, items } = req.body;
        console.log(`[PayMongo Create] Starting request for ${email} - Amount: ${amount}`);

        if (!amount || !email) {
            return res.status(400).json({ ok: false, error: 'Amount and email are required.' });
        }

        const isTestUser = email?.toLowerCase() === 'rad4862@gmail.com';
        const activePmSecret = isTestUser ? pmSecret : pmSecretLive;

        // Verify key format roughly
        if (!activePmSecret.startsWith('sk_')) {
            throw new Error(`Invalid PayMongo secret key format (Check ${isTestUser ? 'Test' : 'Live'} key)`);
        }

        const authHeader = `Basic ${Buffer.from(`${activePmSecret}:`).toString('base64')}`;
        const pmHeaders = {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
        };

        // 1. Create Payment Intent
        console.log('[PayMongo Create] Step 1: Creating Payment Intent...');
        const piRes = await fetch('https://api.paymongo.com/v1/payment_intents', {
            method: 'POST',
            headers: pmHeaders,
            body: JSON.stringify({
                data: {
                    attributes: {
                        amount: Math.round(amount * 100),
                        payment_method_allowed: ['qrph'],
                        currency: 'PHP',
                        description: `Order from DigitalMerch`,
                        statement_descriptor: 'DigitalMerch',
                    }
                }
            })
        });

        const piData = await piRes.json() as any;
        if (!piRes.ok) {
            console.error('[PayMongo Create] PI Error Status:', piRes.status, piData);
            const detail = piData.errors?.[0]?.detail || 'Failed to create payment intent';
            return res.status(400).json({ ok: false, error: `PayMongo PI Error: ${detail}`, raw: piData });
        }

        const intentId = piData.data.id;
        const clientKey = piData.data.attributes.client_key;

        // 2. Create Payment Method
        console.log('[PayMongo Create] Step 2: Creating Payment Method...');
        const pmRes = await fetch('https://api.paymongo.com/v1/payment_methods', {
            method: 'POST',
            headers: pmHeaders,
            body: JSON.stringify({
                data: {
                    attributes: {
                        type: 'qrph',
                        expiry_seconds: 60,
                        billing: {
                            email: email,
                            name: name || username || 'Customer',
                        }
                    }
                }
            })
        });

        const pmData = await pmRes.json() as any;
        if (!pmRes.ok) {
            console.error('[PayMongo Create] PM Error Status:', pmRes.status, pmData);
            const detail = pmData.errors?.[0]?.detail || 'Failed to create payment method';
            return res.status(400).json({ ok: false, error: `PayMongo PM Error: ${detail}`, raw: pmData });
        }

        const methodId = pmData.data.id;

        // 3. Attach
        console.log('[PayMongo Create] Step 3: Attaching to Intent...');
        const attachRes = await fetch(`https://api.paymongo.com/v1/payment_intents/${intentId}/attach`, {
            method: 'POST',
            headers: pmHeaders,
            body: JSON.stringify({
                data: {
                    attributes: {
                        payment_method: methodId,
                        client_key: clientKey
                    }
                }
            })
        });

        const attachData = await attachRes.json() as any;
        if (!attachRes.ok) {
            console.error('[PayMongo Create] Attach Error Status:', attachRes.status, attachData);
            const detail = attachData.errors?.[0]?.detail || 'Failed to attach payment method';
            return res.status(400).json({ ok: false, error: `PayMongo Attach Error: ${detail}`, raw: attachData });
        }

        const nextAction = attachData.data.attributes.next_action;
        let qrUrl = null;
        if (nextAction) {
            if (nextAction.type === 'show_qr') {
                qrUrl = nextAction.show_qr.url || nextAction.show_qr.data;
            } else if (nextAction.type === 'redirect') {
                qrUrl = nextAction.redirect.url;
            }
        }

        // 4. Supabase Log
        console.log('[PayMongo Create] Step 4: Logging Order in Supabase...');
        const supabase = createClient(sbUrl, sbKey);
        const { error: sbError } = await supabase.from('orders').insert({
            payment_intent_id: intentId,
            status: 'awaiting_payment',
            amount_php: amount,
            customer_username: username || email,
            customer_email: email,
            items: items || [],
            updated_at: new Date().toISOString(),
            platform_fee_amount: 0,
            seller_net_amount: amount,
            payout_status: 'pending',
        });

        if (sbError) {
            console.error('[PayMongo Create] Supabase Insert Error:', sbError);
            // We return 200 with QR URL anyway so user can pay, but with a warning for internal logs?
            // Actually better to fail if record is crucial.
            throw new Error(`Database Log Error: ${sbError.message}`);
        }

        console.log('[PayMongo Create] Success:', { intentId, hasQr: !!qrUrl });
        return res.status(200).json({
            ok: true,
            intentId: intentId,
            qrUrl: qrUrl
        });

    } catch (error: any) {
        console.error('[PayMongo Create Exception]:', error);
        return res.status(500).json({
            ok: false,
            error: error.message || 'Unknown Server Exception',
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
}
