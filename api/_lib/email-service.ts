import { Resend } from 'resend';

export const escapeHtml = (value: string) => {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
};

export const formatPhpAmount = (amount: number) => `₱${amount.toFixed(2)}`;

const CONTACT_LINKS_HTML = `
  <div style="margin-top: 18px; padding-top: 14px; border-top: 1px solid #e5e7eb;">
    <p style="margin: 0 0 8px; font-size: 12px; color: #4b5563; font-weight: 600;">Need help or want more products?</p>
    <p style="margin: 0 0 4px; font-size: 12px; color: #6b7280;">
      FB: <a href="https://www.facebook.com/digitalmerch4862/" style="color:#0ea5e9; text-decoration:none;">https://www.facebook.com/digitalmerch4862/</a>
    </p>
    <p style="margin: 0 0 4px; font-size: 12px; color: #6b7280;">
      YT: <a href="https://youtube.com/@digitalmerch-sy7yt?si=c8VCo5afd47Rf5Df" style="color:#0ea5e9; text-decoration:none;">https://youtube.com/@digitalmerch-sy7yt?si=c8VCo5afd47Rf5Df</a>
    </p>
    <p style="margin: 0 0 4px; font-size: 12px; color: #6b7280;">
      Instagram: <a href="https://www.instagram.com/digitalmerch4862/" style="color:#0ea5e9; text-decoration:none;">https://www.instagram.com/digitalmerch4862/</a>
    </p>
    <p style="margin: 0 0 4px; font-size: 12px; color: #6b7280;">
      Email Us: <a href="mailto:digitalmerch4862@gmail.com" style="color:#0ea5e9; text-decoration:none;">digitalmerch4862@gmail.com</a>
    </p>
    <p style="margin: 10px 0 4px; font-size: 12px; color: #4b5563; font-weight: 600;">Shopee Shop</p>
    <p style="margin: 0 0 4px; font-size: 12px; color: #6b7280;">
      Virtu Mart: <a href="https://shopee.ph/shop/1392650544" style="color:#0ea5e9; text-decoration:none;">https://shopee.ph/shop/1392650544</a>
    </p>
    <p style="margin: 0 0 4px; font-size: 12px; color: #6b7280;">
      Soft Mart: <a href="https://shopee.ph/shop/1576711968" style="color:#0ea5e9; text-decoration:none;">https://shopee.ph/shop/1576711968</a>
    </p>
    <p style="margin: 10px 0 4px; font-size: 12px; color: #4b5563; font-weight: 600;">Lazada Shop</p>
    <p style="margin: 0; font-size: 12px; color: #6b7280;">
      Digitalmerch: <a href="https://www.lazada.com.ph/shop/3ecyybmf" style="color:#0ea5e9; text-decoration:none;">https://www.lazada.com.ph/shop/3ecyybmf</a>
    </p>
  </div>`;

export const extractResendErrorMessage = (result: unknown) => {
    if (!result || typeof result !== 'object') {
        return null;
    }

    const maybeError = (result as { error?: unknown }).error;
    if (!maybeError) {
        return null;
    }

    if (typeof maybeError === 'string') {
        return maybeError;
    }

    if (typeof maybeError === 'object' && maybeError !== null) {
        const message = (maybeError as { message?: unknown }).message;
        if (typeof message === 'string' && message.trim()) {
            return message;
        }
    }

    return 'Unknown email delivery error';
};

export const buildEmailHtml = ({
    username,
    products,
    totalAmount,
    serialNo,
    referenceNo,
    submittedOn,
    adminCopy = false,
}: {
    username: string;
    products: Array<{ name: string; amount: number }>;
    totalAmount: number;
    serialNo: string;
    referenceNo: string;
    submittedOn: string;
    adminCopy?: boolean;
}) => {
    const safeName = escapeHtml(username);
    const safeSerial = escapeHtml(serialNo);
    const safeReference = escapeHtml(referenceNo);
    const safeSubmitted = escapeHtml(submittedOn);
    const rowsHtml = products
        .map(
            (item) => `
                                    <tr>
                                        <td style="font-size: 14px; border-bottom: 1px solid #eeeeee;">${escapeHtml(item.name)}</td>
                                        <td align="right" style="font-size: 14px; border-bottom: 1px solid #eeeeee;">${formatPhpAmount(item.amount)}</td>
                                    </tr>`,
        )
        .join('');

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f4;">
    <table border="0" cellpadding="0" cellspacing="0" width="100%">
        <tr>
            <td style="padding: 20px 0;">
                <table align="center" border="0" cellpadding="0" cellspacing="0" width="600" style="background-color: #ffffff; border-radius: 8px; border: 1px solid #dddddd; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                    <tr>
                        <td align="center" style="padding: 40px 20px; background-color: #1a1a1a; color: #ffffff;">
                            <h1 style="margin: 0; font-size: 24px; letter-spacing: 1px; text-transform: uppercase;">DMerch ${adminCopy ? '[ADMIN COPY]' : ''}</h1>
                            <p style="margin: 5px 0 0; font-size: 14px; opacity: 0.8;">Verification Submitted Successfully</p>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 40px 30px;">
                            <p style="margin: 0 0 20px; font-size: 16px; color: #333333;">Hello <strong>${safeName}</strong>,</p>
                            <p style="margin: 0 0 30px; font-size: 15px; color: #555555; line-height: 1.6;">
                                We've received your payment verification request. Our team is currently reviewing the details. You will receive your digital assets once the transaction is fully validated.
                            </p>

                            <table border="0" cellpadding="12" cellspacing="0" width="100%" style="border: 1px solid #eeeeee; border-radius: 5px;">
                                <thead>
                                    <tr style="background-color: #fafafa;">
                                        <th align="left" style="font-size: 12px; color: #888888; border-bottom: 2px solid #eeeeee;">PRODUCT DESCRIPTION</th>
                                        <th align="right" style="font-size: 12px; color: #888888; border-bottom: 2px solid #eeeeee;">AMOUNT</th>
                                    </tr>
                                </thead>
                                <tbody>
${rowsHtml}
                                    <tr style="background-color: #fcfcfc;">
                                        <td align="right" style="font-weight: bold; font-size: 14px;">Total Paid</td>
                                        <td align="right" style="font-weight: bold; font-size: 16px; color: #1a1a1a;">${formatPhpAmount(totalAmount)}</td>
                                    </tr>
                                </tbody>
                            </table>

                            <div style="margin-top: 30px; padding: 20px; background-color: #f9f9f9; border-radius: 5px;">
                                <p style="margin: 0; font-size: 12px; color: #777777;">ORDER SERIAL</p>
                                <p style="margin: 4px 0 15px; font-family: monospace; font-size: 13px; color: #d32f2f; word-break: break-all;">
                                    ${safeSerial}
                                </p>
                                <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                    <tr>
                                        <td width="50%">
                                            <p style="margin: 0; font-size: 12px; color: #777777;">REFERENCE NO</p>
                                            <p style="margin: 4px 0 0; font-size: 14px; font-weight: bold;">${safeReference}</p>
                                        </td>
                                        <td width="50%">
                                            <p style="margin: 0; font-size: 12px; color: #777777;">SUBMITTED ON</p>
                                            <p style="margin: 4px 0 0; font-size: 14px;">${safeSubmitted}</p>
                                        </td>
                                    </tr>
                                </table>
                            </div>
                        </td>
                    </tr>
                    <tr>
                        <td align="center" style="padding: 30px; background-color: #f4f4f4; border-top: 1px solid #eeeeee;">
                            <p style="margin: 0; font-size: 12px; color: #999999;">
                                This is an automated notification from the DMerch system.
                            </p>
${CONTACT_LINKS_HTML}
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;
};

export const sendEmailWithStatus = async ({
    resend,
    from,
    to,
    mailSubject,
    html,
}: {
    resend: Resend;
    from: string;
    to: string;
    mailSubject: string;
    html: string;
}) => {
    try {
        const response = await resend.emails.send({
            from,
            to,
            subject: mailSubject,
            html,
        });
        const resendError = extractResendErrorMessage(response);
        if (resendError) {
            return `failed: ${resendError}`;
        }
        return 'sent';
    } catch (emailError) {
        return `failed: ${emailError instanceof Error ? emailError.message : 'Unknown email error'}`;
    }
};
