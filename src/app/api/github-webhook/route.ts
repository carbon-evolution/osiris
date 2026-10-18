import { NextResponse } from 'next/server';
import crypto from 'crypto';

export async function POST(request: Request) {
    try {
        const payloadText = await request.text();
        const signature = request.headers.get('x-hub-signature-256');
        const secret = process.env.GITHUB_WEBHOOK_SECRET;
        const forwardUrl = process.env.GITHUB_WEBHOOK_FORWARD_URL;

        // Disabled unless fully configured: without a secret this would relay any
        // anonymous POST to the forward target (typically an internal service).
        if (!secret || !forwardUrl) {
            return NextResponse.json({ error: 'GitHub webhook relay is not configured' }, { status: 503 });
        }

        if (!signature) {
            return NextResponse.json({ error: 'Unauthorized: Missing signature' }, { status: 401 });
        }
        const hmac = crypto.createHmac('sha256', secret);
        const digest = 'sha256=' + hmac.update(payloadText).digest('hex');

        // Use timingSafeEqual to prevent timing attacks
        try {
            if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest))) {
                return NextResponse.json({ error: 'Unauthorized: Invalid signature' }, { status: 401 });
            }
        } catch {
            return NextResponse.json({ error: 'Unauthorized: Invalid signature format' }, { status: 401 });
        }

        JSON.parse(payloadText); // reject non-JSON bodies before forwarding

        // Forward the verified payload (e.g. to a Discord bot) at the configured URL.
        const response = await fetch(forwardUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-hub-signature-256': signature,
            },
            body: payloadText,
            signal: AbortSignal.timeout(10_000),
        });

        if (!response.ok) {
            console.error('Failed to forward webhook to Discord bot:', response.statusText);
            return NextResponse.json({ error: 'Failed to forward to bot' }, { status: 500 });
        }

        return NextResponse.json({ success: true, message: 'Webhook forwarded successfully' }, { status: 200 });

    } catch (error) {
        console.error('Error handling GitHub webhook:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
