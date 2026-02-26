import { Resend } from 'resend';
import dotenv from 'dotenv';
import path from 'path';

// Load .env from the project root
dotenv.config({ path: path.join(process.cwd(), '.env') });

const resendApiKey = process.env.RESEND_API_KEY;
const resendFromEmail = process.env.RESEND_FROM_EMAIL;
const testRecipient = process.argv[2] || process.env.ADMIN_EMAIL || 'digitalmerch4862@gmail.com';

async function testEmail() {
    console.log('--- Resend Email Diagnostic ---');
    console.log('RESEND_API_KEY:', resendApiKey ? 'Masked (Length: ' + resendApiKey.length + ')' : 'MISSING');
    console.log('RESEND_FROM_EMAIL:', resendFromEmail || 'MISSING');
    console.log('Test Recipient:', testRecipient);
    console.log('-------------------------------');

    if (!resendApiKey || !resendFromEmail) {
        console.error('Error: Missing environment variables. Please check your .env file or Vercel settings.');
        return;
    }

    const resend = new Resend(resendApiKey);

    try {
        console.log('Attempting to send test email...');
        const result = await resend.emails.send({
            from: resendFromEmail,
            to: testRecipient,
            subject: 'DMerch Diagnostic Test',
            html: '<h1>Diagnostic Successful</h1><p>If you see this, your Resend configuration is working correctly.</p>',
        });

        console.log('Resend Response:', JSON.stringify(result, null, 2));

        if (result.error) {
            console.error('Email failed to send. Check the error message above.');
        } else {
            console.log('Email accepted by Resend! Please check your inbox (and spam folder).');
        }
    } catch (error) {
        console.error('Unexpected Error:', error);
    }
}

testEmail();
