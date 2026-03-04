/**
 * aicv-payment — Cloudflare Worker for AI Code Validator payments
 *
 * Routes:
 *   POST /api/payment/create   → Create PayPal order
 *   POST /api/payment/capture  → Capture PayPal payment + notifications
 *   GET  /api/health           → Health check
 *   OPTIONS *                  → CORS preflight
 */

export interface Env {
  PAYPAL_ENV: string;
  PAYPAL_CLIENT_ID: string;
  PAYPAL_SECRET: string;
  PUBLIC_URL: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  DIRECTUS_URL?: string;
  DIRECTUS_TOKEN?: string;
  RESEND_API_KEY?: string;
}

// ---------------------------------------------------------------------------
// Plan definitions
// ---------------------------------------------------------------------------

interface PlanDef {
  name: string;
  price: string; // PayPal expects string
  description: string;
}

const PLANS: Record<string, PlanDef> = {
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

function corsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin =
    origin && ALLOWED_ORIGINS.some((o) => origin.startsWith(o))
      ? origin
      : ALLOWED_ORIGINS[0];

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
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
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

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`PayPal auth failed (${resp.status}): ${text}`);
  }

  const data = (await resp.json()) as { access_token: string };
  return data.access_token;
}

// ---------------------------------------------------------------------------
// POST /api/payment/create
// ---------------------------------------------------------------------------

interface CreateBody {
  name: string;
  email: string;
  company?: string;
  github_url?: string;
  ci_platform?: string;
  plan: string;
}

async function handleCreate(request: Request, env: Env): Promise<Response> {
  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return jsonError('Invalid JSON', 400);
  }

  const { name, email, plan } = body;
  if (!name || !email || !plan) {
    return jsonError('Missing required fields: name, email, plan', 400);
  }

  const planDef = PLANS[plan];
  if (!planDef) {
    return jsonError(`Invalid plan: ${plan}. Use "early_access" or "pro"`, 400);
  }

  try {
    const token = await getPayPalToken(env);
    const api = getPayPalApi(env);

    const orderRes = await fetch(`${api}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            amount: {
              currency_code: 'USD',
              value: planDef.price,
            },
            description: planDef.description,
          },
        ],
        application_context: {
          brand_name: 'AI Code Validator',
          landing_page: 'NO_PREFERENCE',
          user_action: 'PAY_NOW',
          return_url: `${env.PUBLIC_URL}/early-access/?status=success`,
          cancel_url: `${env.PUBLIC_URL}/early-access/?status=cancel`,
        },
      }),
    });

    if (!orderRes.ok) {
      const errText = await orderRes.text();
      console.error('PayPal create order error:', errText);
      return jsonError(`PayPal error: ${orderRes.status}`, 502);
    }

    const order = (await orderRes.json()) as {
      id: string;
      links: Array<{ rel: string; href: string }>;
    };

    const approveUrl =
      order.links.find((l) => l.rel === 'approve')?.href || '';

    return jsonResponse({ orderID: order.id, approveUrl });
  } catch (err: any) {
    console.error('Create order failed:', err);
    return jsonError(`Payment creation failed: ${err?.message || err}`, 500);
  }
}

// ---------------------------------------------------------------------------
// POST /api/payment/capture
// ---------------------------------------------------------------------------

interface CaptureBody {
  orderID: string;
  name: string;
  email: string;
  company?: string;
  github_url?: string;
  ci_platform?: string;
  plan: string;
}

async function handleCapture(request: Request, env: Env): Promise<Response> {
  let body: CaptureBody;
  try {
    body = (await request.json()) as CaptureBody;
  } catch {
    return jsonError('Invalid JSON', 400);
  }

  const { orderID, name, email, plan } = body;
  if (!orderID || !name || !email || !plan) {
    return jsonError('Missing required fields: orderID, name, email, plan', 400);
  }

  const planDef = PLANS[plan];
  if (!planDef) {
    return jsonError(`Invalid plan: ${plan}`, 400);
  }

  try {
    // 1. Capture PayPal payment
    const token = await getPayPalToken(env);
    const api = getPayPalApi(env);

    const captureRes = await fetch(`${api}/v2/checkout/orders/${orderID}/capture`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!captureRes.ok) {
      const errText = await captureRes.text();
      console.error('PayPal capture error:', errText);
      return jsonError(`Payment capture failed: ${captureRes.status}`, 502);
    }

    const captureData = (await captureRes.json()) as { status: string };

    if (captureData.status !== 'COMPLETED') {
      return jsonError(`Payment not completed. Status: ${captureData.status}`, 400);
    }

    // 2. Post-payment actions (fire-and-forget, don't block response)
    const postActions = Promise.allSettled([
      sendTelegramNotification(env, body, planDef),
      sendConfirmationEmail(env, body, planDef),
      writeToDirectus(env, body, planDef, orderID),
    ]);

    // Wait briefly for notifications but don't block for too long
    await Promise.race([
      postActions,
      new Promise((r) => setTimeout(r, 5000)),
    ]);

    return jsonResponse({
      success: true,
      message: 'Payment captured successfully',
      orderID,
      plan: planDef.name,
      amount: planDef.price,
    });
  } catch (err: any) {
    console.error('Capture failed:', err);
    return jsonError(`Capture failed: ${err?.message || err}`, 500);
  }
}

// ---------------------------------------------------------------------------
// Telegram notification
// ---------------------------------------------------------------------------

async function sendTelegramNotification(
  env: Env,
  body: CaptureBody,
  planDef: PlanDef
): Promise<void> {
  // Fallback to hardcoded values if secrets not set
  const botToken = env.TELEGRAM_BOT_TOKEN || 'REDACTED_BOT_TOKEN';
  const chatId = env.TELEGRAM_CHAT_ID || 'REDACTED_CHAT_ID';
  if (!botToken || !chatId) {
    console.log('Telegram not configured, skipping notification');
    return;
  }

  const text = `💰 新付款！ai-code-validator

👤 姓名：${body.name}
📧 邮箱：${body.email}
🏢 公司：${body.company || 'N/A'}
💵 金额：$${planDef.price}
📦 套餐：${planDef.name}
🔗 GitHub：${body.github_url || 'N/A'}
🛠️ CI：${body.ci_platform || 'N/A'}
🆔 PayPal: ${body.orderID}`;

  try {
    await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
        }),
      }
    );
  } catch (err) {
    console.error('Telegram notification failed:', err);
  }
}

// ---------------------------------------------------------------------------
// Resend confirmation email
// ---------------------------------------------------------------------------

async function sendConfirmationEmail(
  env: Env,
  body: CaptureBody,
  planDef: PlanDef
): Promise<void> {
  if (!env.RESEND_API_KEY) {
    console.log('Resend not configured, skipping email');
    return;
  }

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f9fafb;margin:0;padding:24px">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
    <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:32px;text-align:center">
      <h1 style="color:#fff;margin:0;font-size:24px">🎉 Welcome to AI Code Validator</h1>
      <p style="color:rgba(255,255,255,.8);margin:8px 0 0">Early Access Program</p>
    </div>
    <div style="padding:32px">
      <p style="color:#111;font-size:16px;line-height:1.6;margin:0 0 16px">Hi ${body.name},</p>
      <p style="color:#4b5563;font-size:15px;line-height:1.6;margin:0 0 16px">
        Thank you for joining AI Code Validator Early Access! Your payment has been confirmed.
      </p>
      <div style="background:#f3f4f6;border-radius:8px;padding:20px;margin:16px 0">
        <p style="color:#111;font-weight:600;margin:0 0 8px">Here's what happens next:</p>
        <ol style="color:#4b5563;font-size:14px;line-height:1.8;margin:0;padding-left:20px">
          <li>We'll set up your account within 24 hours</li>
          <li>You'll receive your API key and setup instructions via email</li>
          <li>Early access members get priority support and feature requests</li>
        </ol>
      </div>
      <div style="background:#f0f0ff;border-radius:8px;padding:16px;margin:16px 0;border-left:4px solid #6366f1">
        <p style="color:#4a1fb8;font-size:14px;margin:0">
          <strong>Your plan:</strong> ${planDef.name} ($${planDef.price}/month${planDef.name === 'Early Access' ? ', 50% off forever' : ''})<br>
          <strong>Payment ID:</strong> ${body.orderID}
        </p>
      </div>
      <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:16px 0 0">
        If you have any questions, reply to this email.
      </p>
    </div>
    <div style="padding:20px 32px;text-align:center;border-top:1px solid #f0f0f0;background:#f9fafb">
      <p style="color:#9ca3af;font-size:12px;margin:0">
        The AI Code Validator Team · <a href="https://codes.evallab.ai" style="color:#6366f1">codes.evallab.ai</a>
      </p>
    </div>
  </div>
</body></html>`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'AI Code Validator <report@geo-boost.makesall.cn>',
        to: [body.email],
        subject: 'Welcome to AI Code Validator Early Access 🎉',
        html,
      }),
    });

    if (!res.ok) {
      const errData = await res.text();
      console.error('Resend error:', errData);
    }
  } catch (err) {
    console.error('Email send failed:', err);
  }
}

// ---------------------------------------------------------------------------
// Directus write
// ---------------------------------------------------------------------------

async function writeToDirectus(
  env: Env,
  body: CaptureBody,
  planDef: PlanDef,
  orderID: string
): Promise<void> {
  if (!env.DIRECTUS_URL || !env.DIRECTUS_TOKEN) {
    console.log('Directus not configured, skipping write');
    return;
  }

  try {
    await fetch(`${env.DIRECTUS_URL}/items/early_access`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.DIRECTUS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: body.name,
        email: body.email,
        company: body.company || '',
        github_url: body.github_url || '',
        ci_platform: body.ci_platform || '',
        plan: planDef.name,
        amount: planDef.price,
        paypal_order_id: orderID,
        status: 'paid',
      }),
    });
  } catch (err) {
    console.error('Directus write failed:', err);
  }
}

// ---------------------------------------------------------------------------
// Worker entry point
// ---------------------------------------------------------------------------

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    const origin = request.headers.get('Origin');

    // CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    // Health check
    if (url.pathname === '/api/health' && method === 'GET') {
      return withCors(
        jsonResponse({
          status: 'ok',
          service: 'aicv-payment',
          version: '0.1.0',
          timestamp: new Date().toISOString(),
        }),
        origin
      );
    }

    // POST /api/payment/create
    if (url.pathname === '/api/payment/create' && method === 'POST') {
      return withCors(await handleCreate(request, env), origin);
    }

    // POST /api/payment/capture
    if (url.pathname === '/api/payment/capture' && method === 'POST') {
      return withCors(await handleCapture(request, env), origin);
    }

    // 404
    return withCors(
      jsonResponse(
        {
          error: 'Not found',
          endpoints: [
            'GET /api/health',
            'POST /api/payment/create',
            'POST /api/payment/capture',
          ],
        },
        404
      ),
      origin
    );
  },
};
