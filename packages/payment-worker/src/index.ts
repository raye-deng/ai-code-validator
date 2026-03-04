/**
 * AI Code Validator — Payment + Waitlist Worker (Cloudflare Worker)
 *
 * Endpoints:
 *   GET  /api/health              — Health check
 *   POST /api/payment/create      — Create PayPal order
 *   POST /api/payment/capture     — Capture PayPal payment
 *   POST /api/waitlist            — Join free waitlist
 */

export interface Env {
  PAYPAL_CLIENT_ID: string;
  PAYPAL_SECRET: string;
  PAYPAL_ENV: string;
  PUBLIC_URL: string;
  RESEND_API_KEY: string;
  DIRECTUS_URL?: string;
  DIRECTUS_TOKEN?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  WAITLIST: KVNamespace;
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

const PLANS: Record<string, { name: string; price: string; description: string }> = {
  early_access: {
    name: 'Early Access',
    price: '9.50',
    description: 'AI Code Validator Early Access (50% off forever)',
  },
  pro: {
    name: 'Pro',
    price: '19.00',
    description: 'AI Code Validator Pro Plan',
  },
};

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

const ALLOWED_ORIGINS = [
  'https://codes.evallab.ai',
  'http://localhost:3000',
  'http://localhost:3001',
];

function corsHeaders(origin: string | null) {
  const allowedOrigin =
    origin && ALLOWED_ORIGINS.some((o) => origin.startsWith(o)) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

function withCors(response: Response, origin: string | null): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders(origin))) {
    headers.set(key, value);
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function jsonError(msg: string, status: number): Response {
  return jsonResponse({ error: msg }, status);
}

// ---------------------------------------------------------------------------
// PayPal helpers
// ---------------------------------------------------------------------------

function getPayPalApi(env: Env): string {
  return env.PAYPAL_ENV === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
}

async function getPayPalToken(env: Env): Promise<string> {
  const api = getPayPalApi(env);
  const resp = await fetch(`${api}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_SECRET}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!resp.ok) throw new Error(`PayPal auth failed (${resp.status})`);
  const data: any = await resp.json();
  return data.access_token;
}

// ---------------------------------------------------------------------------
// Payment handlers
// ---------------------------------------------------------------------------

async function handleCreate(request: Request, env: Env): Promise<Response> {
  let body: any;
  try { body = await request.json(); } catch { return jsonError('Invalid JSON', 400); }

  const { name, email, plan } = body;
  if (!name || !email || !plan) return jsonError('Missing required fields: name, email, plan', 400);

  const planDef = PLANS[plan];
  if (!planDef) return jsonError(`Invalid plan: ${plan}`, 400);

  try {
    const token = await getPayPalToken(env);
    const api = getPayPalApi(env);
    const orderRes = await fetch(`${api}/v2/checkout/orders`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{ amount: { currency_code: 'USD', value: planDef.price }, description: planDef.description }],
        application_context: {
          brand_name: 'AI Code Validator',
          landing_page: 'NO_PREFERENCE',
          user_action: 'PAY_NOW',
          return_url: `${env.PUBLIC_URL}/early-access/?status=success`,
          cancel_url: `${env.PUBLIC_URL}/early-access/?status=cancel`,
        },
      }),
    });
    if (!orderRes.ok) return jsonError(`PayPal error: ${orderRes.status}`, 502);
    const order: any = await orderRes.json();
    const approveUrl = order.links?.find((l: any) => l.rel === 'approve')?.href || '';
    return jsonResponse({ orderID: order.id, approveUrl });
  } catch (err: any) {
    return jsonError(`Payment creation failed: ${err?.message || err}`, 500);
  }
}

async function handleCapture(request: Request, env: Env): Promise<Response> {
  let body: any;
  try { body = await request.json(); } catch { return jsonError('Invalid JSON', 400); }

  const { orderID, name, email, plan } = body;
  if (!orderID || !name || !email || !plan) return jsonError('Missing required fields', 400);

  const planDef = PLANS[plan];
  if (!planDef) return jsonError(`Invalid plan: ${plan}`, 400);

  try {
    const token = await getPayPalToken(env);
    const api = getPayPalApi(env);
    const captureRes = await fetch(`${api}/v2/checkout/orders/${orderID}/capture`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    if (!captureRes.ok) return jsonError(`Payment capture failed: ${captureRes.status}`, 502);
    const captureData: any = await captureRes.json();
    if (captureData.status !== 'COMPLETED') return jsonError(`Payment not completed: ${captureData.status}`, 400);

    // Fire-and-forget post-payment actions
    Promise.allSettled([
      sendTelegramNotification(env, body, planDef),
      sendConfirmationEmail(env, body, planDef),
      writeToDirectus(env, body, planDef, orderID),
    ]);

    return jsonResponse({ success: true, message: 'Payment captured successfully', orderID, plan: planDef.name, amount: planDef.price });
  } catch (err: any) {
    return jsonError(`Capture failed: ${err?.message || err}`, 500);
  }
}

// ---------------------------------------------------------------------------
// Waitlist handler (NEW)
// ---------------------------------------------------------------------------

async function handleWaitlist(request: Request, env: Env): Promise<Response> {
  let body: any;
  try { body = await request.json(); } catch { return jsonError('Invalid JSON', 400); }

  const { name, email, company, github_url, ci_platform } = body;
  if (!name || !email) return jsonError('Missing required fields: name, email', 400);

  // Basic email validation
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return jsonError('Invalid email address', 400);

  try {
    // Save to KV
    await writeWaitlistToKV(env, { name, email, company, github_url, ci_platform });

    // Send welcome email
    await sendWaitlistWelcomeEmail(env, { name, email });

    // Notify via Telegram
    await sendTelegramWaitlistNotification(env, { name, email, company, ci_platform });

    return jsonResponse({ success: true, message: 'Successfully joined the waitlist! Check your email.' });
  } catch (err: any) {
    console.error('Waitlist error:', err);
    return jsonError(`Failed to join waitlist: ${err?.message || err}`, 500);
  }
}

async function writeWaitlistToKV(env: Env, data: { name: string; email: string; company?: string; github_url?: string; ci_platform?: string }) {
  const key = `waitlist:${data.email}:${Date.now()}`;
  const value = JSON.stringify({
    ...data,
    plan: 'waitlist',
    status: 'pending',
    created_at: new Date().toISOString(),
  });
  await env.WAITLIST.put(key, value, { expirationTtl: 60 * 60 * 24 * 365 }); // 1 year
  console.log('Waitlist entry saved to KV:', key);
}

async function sendWaitlistWelcomeEmail(env: Env, data: { name: string; email: string }) {
  if (!env.RESEND_API_KEY) return;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'AI Code Validator <report@geo-boost.makesall.cn>',
        to: [data.email],
        subject: "You're on the AI Code Validator waitlist 🛡️",
        html: `
          <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
            <div style="text-align: center; margin-bottom: 32px;">
              <span style="font-size: 48px;">🛡️</span>
              <h1 style="font-size: 24px; font-weight: bold; margin-top: 16px;">You're on the list, ${data.name}!</h1>
            </div>
            <p style="color: #374151; line-height: 1.6;">Thanks for joining the AI Code Validator waitlist. We're building the first CI/CD quality gate specifically for AI-generated code.</p>
            <p style="color: #374151; line-height: 1.6;">We'll notify you when we launch — and as an early waitlist member, you'll get first access plus our best pricing.</p>
            <div style="background: #f3f4f6; border-radius: 12px; padding: 20px; margin: 24px 0;">
              <p style="font-weight: 600; margin-bottom: 8px;">What we're building:</p>
              <ul style="color: #4b5563; line-height: 1.8; padding-left: 20px;">
                <li>Hallucination detection — catch phantom packages before they ship</li>
                <li>Logic gap analysis — find empty catch blocks and dead code</li>
                <li>0–100 quality score with CI/CD integration</li>
                <li>AI self-heal prompts to fix issues automatically</li>
              </ul>
            </div>
            <p style="color: #374151;">In the meantime, you can try our free CLI:</p>
            <pre style="background: #1f2937; color: #a3e635; padding: 16px; border-radius: 8px; font-size: 14px;">npx ai-code-validator scan ./src</pre>
            <p style="color: #6b7280; font-size: 14px; margin-top: 32px;">— The AI Code Validator team</p>
          </div>
        `,
      }),
    });
  } catch (err) {
    console.error('Waitlist welcome email failed:', err);
  }
}

async function sendTelegramWaitlistNotification(env: Env, data: { name: string; email: string; company?: string; ci_platform?: string }) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
  try {
    const msg = `📋 New waitlist signup!\n👤 ${data.name} (${data.email})\n🏢 ${data.company || 'N/A'}\n⚙️ CI: ${data.ci_platform || 'N/A'}`;
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: msg }),
    });
  } catch (err) {
    console.error('Telegram waitlist notification failed:', err);
  }
}

// ---------------------------------------------------------------------------
// Existing helpers (payment flow)
// ---------------------------------------------------------------------------

async function sendTelegramNotification(env: Env, body: any, planDef: { name: string; price: string }) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
  try {
    const msg = `💰 New payment!\n👤 ${body.name} (${body.email})\n📦 ${planDef.name} — $${planDef.price}\n🏢 ${body.company || 'N/A'}`;
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: msg }),
    });
  } catch (err) {
    console.error('Telegram notification failed:', err);
  }
}

async function sendConfirmationEmail(env: Env, body: any, planDef: { name: string; price: string }) {
  if (!env.RESEND_API_KEY) return;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'AI Code Validator <report@geo-boost.makesall.cn>',
        to: [body.email],
        subject: `Welcome to AI Code Validator ${planDef.name} 🛡️`,
        html: `<p>Hi ${body.name}, thank you for subscribing to AI Code Validator ${planDef.name}!</p><p>Your payment of $${planDef.price}/month has been confirmed.</p>`,
      }),
    });
  } catch (err) {
    console.error('Email send failed:', err);
  }
}

async function writeToDirectus(env: Env, body: any, planDef: { name: string; price: string }, orderID: string) {
  if (!env.DIRECTUS_URL || !env.DIRECTUS_TOKEN) return;
  try {
    await fetch(`${env.DIRECTUS_URL}/items/early_access`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.DIRECTUS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: body.name, email: body.email, company: body.company || '',
        github_url: body.github_url || '', ci_platform: body.ci_platform || '',
        plan: planDef.name, amount: planDef.price, paypal_order_id: orderID, status: 'paid',
      }),
    });
  } catch (err) {
    console.error('Directus write failed:', err);
  }
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    const origin = request.headers.get('Origin');

    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (url.pathname === '/api/health' && method === 'GET') {
      return withCors(jsonResponse({ status: 'ok', service: 'aicv-payment', version: '0.2.0', timestamp: new Date().toISOString() }), origin);
    }

    if (url.pathname === '/api/payment/create' && method === 'POST') {
      return withCors(await handleCreate(request, env), origin);
    }

    if (url.pathname === '/api/payment/capture' && method === 'POST') {
      return withCors(await handleCapture(request, env), origin);
    }

    if (url.pathname === '/api/waitlist' && method === 'POST') {
      return withCors(await handleWaitlist(request, env), origin);
    }

    return withCors(jsonResponse({
      error: 'Not found',
      endpoints: ['GET /api/health', 'POST /api/payment/create', 'POST /api/payment/capture', 'POST /api/waitlist'],
    }, 404), origin);
  },
};
