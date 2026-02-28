import { Resend } from "https://esm.sh/resend@0.16.0"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

export async function fulfillOrder(supabase: any, resend: Resend, referenceNo: string, email: string, username: string) {
    console.log(`Fulfilling order: ${referenceNo} for ${email}`)

    // 1. Fetch products associated with this order
    // Note: In our verification_orders, products are often in products_json
    const { data: order, error: orderError } = await supabase
        .from('verification_orders')
        .select('products_json')
        .eq('reference_no', referenceNo)
        .single()

    if (orderError || !order) {
        console.error('Error fetching order for fulfillment:', orderError)
        return
    }

    const products = order.products_json || []
    const productLinks: string[] = []

    // 2. Fetch file_url for each product
    for (const p of products) {
        // Try to match by name if ID isn't solid, but ID is preferred
        const { data: prodData } = await supabase
            .from('products')
            .select('name, file_url')
            .or(`id.eq.${p.id},name.eq.${p.name}`)
            .single()

        if (prodData?.file_url) {
            productLinks.push(`<strong>${prodData.name}</strong>: <a href="${prodData.file_url}">${prodData.file_url}</a>`)
        } else {
            productLinks.push(`<strong>${p.name}</strong>: Link will be sent manually by admin.`)
        }
    }

    // 3. Send Email
    const htmlContent = `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
            <h2 style="color: #1a1a1a;">Thank you for your purchase, ${username}!</h2>
            <p>Your payment for order <strong>${referenceNo}</strong> has been confirmed.</p>
            <p>Here are your digital product links:</p>
            <ul style="list-style: none; padding: 0;">
                ${productLinks.map(link => `<li style="margin-bottom: 15px; padding: 10px; background: #f9f9f9; border-radius: 5px;">${link}</li>`).join('')}
            </ul>
            <p style="font-size: 12px; color: #666; margin-top: 30px;">
                If you have any issues, please contact us at digitalmerch4862@gmail.com
            </p>
        </div>
    `

    const { error: emailError } = await resend.emails.send({
        from: 'DigitalMerch <orders@paymentportal.digitalmarchs.store>', // Should use a verified domain in production
        to: email,
        subject: `Your DigitalMerch Order: ${referenceNo}`,
        html: htmlContent,
    })

    if (emailError) {
        console.error('Error sending fulfillment email:', emailError)
        await supabase.from('verification_orders').update({ email_status: 'failed' }).eq('reference_no', referenceNo)
    } else {
        console.log(`Fulfillment email sent for ${referenceNo}`)
        await supabase.from('verification_orders').update({ email_status: 'sent' }).eq('reference_no', referenceNo)
    }
}
