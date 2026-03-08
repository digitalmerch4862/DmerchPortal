import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Paymongo-Signature',
};

const MANILA_TIMEZONE = 'Asia/Manila';

const getManilaSerialParts = (date: Date) => {
    const shortParts = new Intl.DateTimeFormat('en-US', {
        timeZone: MANILA_TIMEZONE,
        year: 'numeric',
        month: 'short',
        day: '2-digit',
    }).formatToParts(date);

    const getPart = (parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) => {
        return parts.find((part) => part.type === type)?.value ?? '';
    };

    const year = getPart(shortParts, 'year');
    const monthShort = getPart(shortParts, 'month').toUpperCase();
    const day = getPart(shortParts, 'day');

    return {
        datePart: `${year}${monthShort}${day}`,
        monthSerialPrefix: `${year}${monthShort}`,
    };
};

const verifySignature = (payload: string, signature: string, secret: string): boolean => {
    const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');
    return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
    );
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

    const webhookSecret = process.env.PAYMONGO_WEBHOOK_SECRET;
    const sbUrl = process.env.SUPABASE_URL;
    const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!webhookSecret || !sbUrl || !sbKey) {
        return res.status(500).json({ ok: false, error: 'Missing server configuration.' });
    }

    try {
        const rawBody = JSON.stringify(req.body);
        const signature = req.headers['paymongo-signature'];

        if (!signature) {
            console.error('Missing Paymongo-Signature header');
            return res.status(401).json({ ok: false, error: 'Missing signature' });
        }

        const isValid = verifySignature(rawBody, signature, webhookSecret);
        if (!isValid) {
            console.error('Invalid webhook signature');
            return res.status(401).json({ ok: false, error: 'Invalid signature' });
        }

        const event = req.body;
        const eventType = event.type;
        const data = event.data?.attributes;

        console.log('Webhook received:', eventType, data?.payment_intent_id);

        const supabase = createClient(sbUrl, sbKey);

        if (eventType === 'payment_intent.succeeded') {
            const intentId = data.payment_intent_id;
            
            const { data: order } = await supabase
                .from('orders')
                .select('*')
                .eq('payment_intent_id', intentId)
                .single();

            if (!order) {
                console.error('Order not found:', intentId);
                return res.status(200).json({ ok: true, message: 'Order not found, acknowledged' });
            }

            if (order.status !== 'paid') {
                await supabase.from('orders').update({ 
                    status: 'paid', 
                    updated_at: new Date().toISOString() 
                }).eq('id', order.id);

                const sequenceResponse = await supabase.rpc('next_verification_sequence');
                const sequenceNo = sequenceResponse.data;

                const now = new Date();
                const { datePart } = getManilaSerialParts(now);
                const serialNo = `DMERCH-${datePart}-PM-${intentId.slice(-4).toUpperCase()}`;

                await supabase.from('verification_orders').insert({
                    sequence_no: sequenceNo,
                    serial_no: serialNo,
                    username: order.customer_username,
                    email: order.customer_email || order.customer_username,
                    product_name: order.items?.[0]?.name || 'PayMongo Order',
                    amount: order.amount_php,
                    products_json: order.items,
                    total_amount: order.amount_php,
                    reference_no: intentId,
                    payment_portal_used: 'PAYMONGO QRPH',
                    payment_detail_used: `PayMongo Intent ${intentId}`,
                    email_status: 'review:submitted',
                });

                console.log('Payment succeeded for order:', order.id);
            }
        } else if (eventType === 'payment_intent.payment_failed') {
            const intentId = data.payment_intent_id;
            
            const { data: order } = await supabase
                .from('orders')
                .select('*')
                .eq('payment_intent_id', intentId)
                .single();

            if (order && order.status !== 'failed') {
                await supabase.from('orders').update({ 
                    status: 'failed',
                    updated_at: new Date().toISOString()
                }).eq('id', order.id);
                console.log('Payment failed for order:', order.id);
            }
        }

        res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
        return res.status(200).json({ ok: true, received: true });

    } catch (error: any) {
        console.error('PayMongo Webhook Error:', error);
        return res.status(500).json({ ok: false, error: error.message });
    }
}
