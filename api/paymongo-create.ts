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
        return res.status(500).json({ ok: false, error: 'Missing server configuration (PM/SB keys).' });
    }

    try {
        const { amount, email, name, username, items } = req.body;

        if (!amount || !email) {
            return res.status(400).json({ ok: false, error: 'Amount and Email are required.' });
        }

        const isTestUser = email?.toLowerCase() === 'rad4862@gmail.com';
        const activePmSecret = isTestUser ? pmSecret : pmSecretLive;

        const authHeader = `Basic ${Buffer.from(`${activePmSecret}:`).toString('base64')}`;
        const pmHeaders = {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
        };

        // 1. Create Payment Intent
        const piRes = await fetch('https://api.paymongo.com/v1/payment_intents', {
            method: 'POST',
            headers: pmHeaders,
            body: JSON.stringify({
                data: {
                    attributes: {
                        amount: Math.round(amount * 100),
                        payment_method_allowed: ['qrph'],
                        currency: 'PHP',
                        description: `Order for ${username || email}`,
                        statement_descriptor: 'DigitalMerch',
                        expires_at: Math.floor(Date.now() / 1000) + 300,
                    }
                }
            })
        });

        const piData = await piRes.json();
        if (!piRes.ok) throw new Error(piData.errors?.[0]?.detail || 'Failed to create Payment Intent');

        const intentId = piData.data.id;
        const clientKey = piData.data.attributes.client_key;

        // 2. Create Payment Method (QRPH)
        const pmRes = await fetch('https://api.paymongo.com/v1/payment_methods', {
            method: 'POST',
            headers: pmHeaders,
            body: JSON.stringify({
                data: {
                    attributes: {
                        type: 'qrph',
                        billing: {
                            email: email,
                            name: name || username || 'Customer',
                        }
                    }
                }
            })
        });

        const pmData = await pmRes.json();
        if (!pmRes.ok) throw new Error(pmData.errors?.[0]?.detail || 'Failed to create Payment Method');

        const methodId = pmData.data.id;

        // 3. Attach Method to Intent
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

        const attachData = await attachRes.json();
        if (!attachRes.ok) throw new Error(attachData.errors?.[0]?.detail || 'Failed to attach Payment Method');

        const nextAction = attachData.data.attributes.next_action;
        let qrUrl = null;
        if (nextAction) {
            if (nextAction.type === 'show_qr') {
                qrUrl = nextAction.show_qr.url || nextAction.show_qr.data;
            } else if (nextAction.type === 'redirect') {
                qrUrl = nextAction.redirect.url;
            }
        }

        // 4. Log to Supabase orders table
        const supabase = createClient(sbUrl, sbKey);
        const now = new Date().toISOString();
        const { error: sbError } = await supabase.from('orders').insert({
            payment_intent_id: intentId,
            status: 'awaiting_payment',
            amount_php: amount,
            customer_username: username || email,
            customer_email: email,
            items: items || [],
            updated_at: now,
            platform_fee_amount: 0,
            seller_net_amount: amount,
            payout_status: 'pending',
        });

        if (sbError) {
            console.error('Supabase logging error:', sbError);
            return res.status(500).json({ ok: false, error: `Failed to log order: ${sbError.message}` });
        }

        res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
        return res.status(200).json({
            ok: true,
            intentId,
            qrUrl,
        });

    } catch (error: any) {
        console.error('PayMongo Create Error:', error);
        return res.status(500).json({ ok: false, error: error.message });
    }
}
