import { createClient } from '@supabase/supabase-js';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

const MANILA_TIMEZONE = 'Asia/Manila';

const formatSubmittedDate = (dateIso: string) => {
    const date = new Date(dateIso);
    const dateText = date.toLocaleDateString('en-US', {
        timeZone: MANILA_TIMEZONE,
        month: 'short',
        day: '2-digit',
        year: 'numeric',
    });
    const timeText = date.toLocaleTimeString('en-US', {
        timeZone: MANILA_TIMEZONE,
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    });
    return `${dateText} | ${timeText}`;
};

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

export default async function handler(req: any, res: any) {
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
        res.setHeader('Access-Control-Allow-Methods', corsHeaders['Access-Control-Allow-Methods']);
        res.setHeader('Access-Control-Allow-Headers', corsHeaders['Access-Control-Allow-Headers']);
        return res.status(204).end();
    }

    const { intentId } = req.query;
    if (!intentId) return res.status(400).json({ ok: false, error: 'Intent ID is required.' });

    const pmSecret = process.env.PAYMONGO_SECRET_KEY;
    const sbUrl = process.env.SUPABASE_URL;
    const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!pmSecret || !sbUrl || !sbKey) return res.status(500).json({ ok: false, error: 'Missing server configuration.' });

    try {
        const authHeader = `Basic ${Buffer.from(`${pmSecret}:`).toString('base64')}`;
        const piRes = await fetch(`https://api.paymongo.com/v1/payment_intents/${intentId}`, {
            headers: { 'Authorization': authHeader }
        });

        const piData = await piRes.json();
        if (!piRes.ok) throw new Error('Failed to fetch Payment Intent status');

        const pmStatus = piData.data.attributes.status;
        const supabase = createClient(sbUrl, sbKey);

        // Check current status in DB
        const { data: order } = await supabase
            .from('orders')
            .select('*')
            .eq('payment_intent_id', intentId)
            .single();

        if (!order) return res.status(404).json({ ok: false, error: 'Order not found in database.' });

        let updated = false;
        let finalStatus = order.status;

        if (pmStatus === 'succeeded' && order.status !== 'paid') {
            finalStatus = 'paid';

            // 1. Update Order Status
            await supabase.from('orders').update({ status: 'paid', updated_at: new Date().toISOString() }).eq('id', order.id);

            // 2. Generate Verification Order (Lazada Magic)
            const sequenceResponse = await supabase.rpc('next_verification_sequence');
            const sequenceNo = sequenceResponse.data;

            const now = new Date();
            const { datePart } = getManilaSerialParts(now);

            // Simple serial generation for brevity, or we could fetch max suffix
            const serialNo = `DMERCH-${datePart}-PM-${intentId.slice(-4).toUpperCase()}`;

            const { error: vError } = await supabase.from('verification_orders').insert({
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
                email_status: 'review:submitted', // Queued for admin approval
            });

            if (vError) {
                console.error('Failed to create verification order:', vError.message);
            }
            updated = true;
        } else if (pmStatus === 'failed' && order.status !== 'failed') {
            finalStatus = 'failed';
            await supabase.from('orders').update({ status: 'failed' }).eq('id', order.id);
            updated = true;
        }

        res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
        return res.status(200).json({
            ok: true,
            status: finalStatus,
            updated,
            paymongoStatus: pmStatus
        });

    } catch (error: any) {
        console.error('PayMongo Status Error:', error);
        return res.status(500).json({ ok: false, error: error.message });
    }
}
