'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const WORKER_URL = 'https://aicv-payment.v2ray-seins.workers.dev';
const PAYPAL_CLIENT_ID =
  'AaKU7Axmtc7Cfx88meDLF6KGhkD2utBmqgo2NbyF1fmIJ_3aGbYS3h6Z--vss4q2yeWxX0XWfeRh0cOh';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PageState = 'idle' | 'paying' | 'processing' | 'success' | 'error' | 'waitlist_success';

interface FormData {
  name: string;
  email: string;
  company: string;
  github_url: string;
  ci_platform: string;
  plan: 'early_access' | 'pro';
}

const PLANS = {
  early_access: {
    name: 'Early Access',
    price: '$9.50',
    priceNum: 9.5,
    period: '/month',
    badge: '50% OFF FOREVER',
    features: [
      'Full validation engine',
      'GitHub Actions + GitLab CI',
      'Up to 500 validations/month',
      'Priority support',
      'Locked-in pricing forever',
    ],
  },
  pro: {
    name: 'Pro',
    price: '$19',
    priceNum: 19,
    period: '/month',
    badge: null,
    features: [
      'Everything in Early Access',
      'Unlimited validations',
      'Custom rules engine',
      'Team management',
      'API access',
      'Slack/Teams integration',
    ],
  },
} as const;

// ---------------------------------------------------------------------------
// PayPal script loader
// ---------------------------------------------------------------------------

function usePayPalScript(onReady: () => void) {
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;
    if ((window as any).paypal) {
      loadedRef.current = true;
      onReady();
      return;
    }

    const script = document.createElement('script');
    script.src = `https://www.paypal.com/sdk/js?client-id=${PAYPAL_CLIENT_ID}&currency=USD`;
    script.async = true;
    script.onload = () => {
      loadedRef.current = true;
      onReady();
    };
    script.onerror = () => {
      console.error('Failed to load PayPal SDK');
    };
    document.head.appendChild(script);
  }, [onReady]);
}

// ---------------------------------------------------------------------------
// PayPal Buttons component
// ---------------------------------------------------------------------------

function PayPalButtons({
  formData,
  onSuccess,
  onError,
}: {
  formData: FormData;
  onSuccess: (orderID: string) => void;
  onError: (msg: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const renderedRef = useRef(false);

  const renderButtons = useCallback(() => {
    const paypal = (window as any).paypal;
    if (!paypal || !containerRef.current || renderedRef.current) return;
    renderedRef.current = true;

    paypal
      .Buttons({
        style: {
          layout: 'vertical',
          color: 'blue',
          shape: 'rect',
          label: 'pay',
          height: 50,
        },
        createOrder: async () => {
          const res = await fetch(`${WORKER_URL}/api/payment/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed to create order');
          return data.orderID;
        },
        onApprove: async (data: { orderID: string }) => {
          const res = await fetch(`${WORKER_URL}/api/payment/capture`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...formData, orderID: data.orderID }),
          });
          const result = await res.json();
          if (!res.ok) throw new Error(result.error || 'Capture failed');
          onSuccess(data.orderID);
        },
        onError: (err: any) => {
          console.error('PayPal error:', err);
          onError(err?.message || 'Payment failed. Please try again.');
        },
        onCancel: () => {
          onError('Payment was cancelled.');
        },
      })
      .render(containerRef.current);
  }, [formData, onSuccess, onError]);

  usePayPalScript(renderButtons);

  return (
    <div>
      <div ref={containerRef} className="min-h-[60px]" />
      <p className="text-center text-gray-500 text-xs mt-3">
        Secured by PayPal &middot; 256-bit encryption
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function EarlyAccess() {
  const [state, setState] = useState<PageState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [orderID, setOrderID] = useState('');
  const [formData, setFormData] = useState<FormData>({
    name: '',
    email: '',
    company: '',
    github_url: '',
    ci_platform: '',
    plan: 'early_access',
  });

  // -------------------------------------------------------------------------
  // Success state
  // -------------------------------------------------------------------------
  if (state === 'success') {
    return (
      <main className="min-h-screen flex items-center justify-center px-6">
        <div className="max-w-lg text-center">
          <span className="text-6xl mb-6 block">🎉</span>
          <h1 className="text-4xl font-bold mb-4">Welcome Aboard!</h1>
          <p className="text-xl text-gray-400 mb-4">
            Your payment has been confirmed. You&apos;re now part of the
            <span className="text-primary-300 font-semibold"> AI Code Validator Early Access</span> program.
          </p>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-8 text-left">
            <h3 className="text-white font-semibold mb-3">What happens next:</h3>
            <ol className="text-gray-400 space-y-2 list-decimal list-inside">
              <li>We&apos;ll set up your account within 24 hours</li>
              <li>You&apos;ll receive your API key and setup instructions via email</li>
              <li>Early access members get priority support and feature requests</li>
            </ol>
            {orderID && (
              <p className="text-gray-500 text-sm mt-4">
                Payment ID: <code className="text-gray-400">{orderID}</code>
              </p>
            )}
          </div>
          <p className="text-gray-500 mb-6">
            A confirmation email has been sent to <strong className="text-gray-300">{formData.email}</strong>
          </p>
          <a
            href="/"
            className="inline-block px-6 py-3 bg-primary-600 hover:bg-primary-500 text-white font-semibold rounded-xl transition"
          >
            &larr; Back to Home
          </a>
        </div>
      </main>
    );
  }

  // -------------------------------------------------------------------------
  // Waitlist success state
  // -------------------------------------------------------------------------
  if (state === 'waitlist_success') {
    return (
      <main className="min-h-screen flex items-center justify-center px-6">
        <div className="max-w-lg text-center">
          <span className="text-6xl mb-6 block">📋</span>
          <h1 className="text-4xl font-bold mb-4">You&apos;re on the list!</h1>
          <p className="text-xl text-gray-400 mb-4">
            We&apos;ll notify <strong className="text-gray-300">{formData.email}</strong> when AI Code Validator launches.
          </p>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-8 text-left">
            <h3 className="text-white font-semibold mb-3">While you wait:</h3>
            <p className="text-gray-400 text-sm mb-3">Try the free CLI right now:</p>
            <pre className="bg-gray-950 text-green-400 text-sm p-4 rounded-lg font-mono">npx ai-code-validator scan ./src</pre>
          </div>
          <a href="/" className="inline-block px-6 py-3 bg-primary-600 hover:bg-primary-500 text-white font-semibold rounded-xl transition">
            &larr; Back to Home
          </a>
        </div>
      </main>
    );
  }

  // -------------------------------------------------------------------------
  // Form + payment
  // -------------------------------------------------------------------------

  const handleFormChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleProceedToPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.ci_platform) return;
    setErrorMsg('');
    setState('paying');
  };

  const handleWaitlistSubmit = async () => {
    if (!formData.name || !formData.email || !formData.ci_platform) return;
    setState('processing');
    try {
      const res = await fetch(`${WORKER_URL}/api/waitlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (!res.ok) throw new Error('Failed to join waitlist');
      setState('waitlist_success');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to join waitlist. Please try again.');
      setState('error');
    }
  };

  const isFormValid = formData.name && formData.email && formData.ci_platform;
  const selectedPlan = PLANS[formData.plan];

  return (
    <main className="min-h-screen py-20 px-6">
      {/* Back link */}
      <div className="max-w-2xl mx-auto mb-8">
        <a href="/" className="text-gray-500 hover:text-gray-300 transition text-sm">
          &larr; Back to Home
        </a>
      </div>

      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <span className="text-5xl mb-4 block">🛡️</span>
          <h1 className="text-4xl font-bold mb-4">Join the Early Access Program</h1>
          <p className="text-gray-400 text-lg">
            Be among the first 50 teams to validate AI code quality.
            <br />
            <span className="text-primary-300 font-semibold">Lock in 50% off forever.</span>
          </p>
        </div>

        {/* Error banner */}
        {errorMsg && (
          <div className="mb-6 p-4 bg-red-900/30 border border-red-700 rounded-xl text-red-300 text-sm">
            {errorMsg}
            <button
              onClick={() => {
                setErrorMsg('');
                setState('idle');
              }}
              className="ml-3 underline hover:text-red-200"
            >
              Try again
            </button>
          </div>
        )}

        {/* Plan selector */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {(Object.entries(PLANS) as [keyof typeof PLANS, (typeof PLANS)[keyof typeof PLANS]][]).map(
            ([key, plan]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  if (state !== 'paying') {
                    setFormData((prev) => ({ ...prev, plan: key }));
                  }
                }}
                className={`relative p-6 rounded-xl border-2 text-left transition ${
                  formData.plan === key
                    ? 'border-primary-500 bg-primary-500/10'
                    : 'border-gray-700 bg-gray-900 hover:border-gray-600'
                } ${state === 'paying' ? 'cursor-default' : 'cursor-pointer'}`}
              >
                {plan.badge && (
                  <span className="absolute -top-3 left-4 px-3 py-0.5 bg-primary-600 text-white text-xs font-bold rounded-full">
                    {plan.badge}
                  </span>
                )}
                <div className="flex items-baseline gap-1 mb-3">
                  <span className="text-3xl font-bold text-white">{plan.price}</span>
                  <span className="text-gray-400">{plan.period}</span>
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{plan.name}</h3>
                <ul className="space-y-1.5">
                  {plan.features.map((f, i) => (
                    <li key={i} className="text-gray-400 text-sm flex items-start gap-2">
                      <span className="text-primary-400 mt-0.5">&#10003;</span>
                      {f}
                    </li>
                  ))}
                </ul>
              </button>
            )
          )}
        </div>

        {/* Form */}
        <form onSubmit={handleProceedToPayment} className="space-y-5">
          {/* Name */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-2">
              Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              id="name"
              name="name"
              required
              value={formData.name}
              onChange={handleFormChange}
              disabled={state === 'paying'}
              placeholder="Your name"
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition disabled:opacity-60"
            />
          </div>

          {/* Email */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
              Email <span className="text-red-400">*</span>
            </label>
            <input
              type="email"
              id="email"
              name="email"
              required
              value={formData.email}
              onChange={handleFormChange}
              disabled={state === 'paying'}
              placeholder="you@company.com"
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition disabled:opacity-60"
            />
          </div>

          {/* Company */}
          <div>
            <label htmlFor="company" className="block text-sm font-medium text-gray-300 mb-2">
              Company <span className="text-gray-500">(optional)</span>
            </label>
            <input
              type="text"
              id="company"
              name="company"
              value={formData.company}
              onChange={handleFormChange}
              disabled={state === 'paying'}
              placeholder="Your company"
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition disabled:opacity-60"
            />
          </div>

          {/* GitHub URL */}
          <div>
            <label htmlFor="github_url" className="block text-sm font-medium text-gray-300 mb-2">
              GitHub / GitLab URL <span className="text-gray-500">(optional)</span>
            </label>
            <input
              type="url"
              id="github_url"
              name="github_url"
              value={formData.github_url}
              onChange={handleFormChange}
              disabled={state === 'paying'}
              placeholder="https://github.com/your-org/your-repo"
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition disabled:opacity-60"
            />
          </div>

          {/* CI/CD Platform */}
          <div>
            <label htmlFor="ci_platform" className="block text-sm font-medium text-gray-300 mb-2">
              CI/CD Platform <span className="text-red-400">*</span>
            </label>
            <select
              id="ci_platform"
              name="ci_platform"
              required
              value={formData.ci_platform}
              onChange={handleFormChange}
              disabled={state === 'paying'}
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-xl text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition disabled:opacity-60"
            >
              <option value="">Select your platform</option>
              <option value="github">GitHub Actions</option>
              <option value="gitlab">GitLab CI</option>
              <option value="both">Both</option>
              <option value="other">Other</option>
            </select>
          </div>

          {/* Action area */}
          {state === 'idle' && (
            <div className="space-y-3">
              <button
                type="submit"
                disabled={!isFormValid}
                className="w-full py-4 bg-primary-600 hover:bg-primary-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition text-lg"
              >
                Continue to Payment &mdash; {selectedPlan.price}/mo
              </button>
              <button
                type="button"
                disabled={!isFormValid}
                onClick={handleWaitlistSubmit}
                className="w-full py-3 border border-gray-600 hover:border-gray-400 disabled:opacity-40 disabled:cursor-not-allowed text-gray-300 hover:text-white rounded-xl transition text-sm"
              >
                🎁 Join free waitlist — notify me when it launches
              </button>
            </div>
          )}
        </form>

        {/* PayPal buttons */}
        {state === 'paying' && (
          <div className="mt-6">
            <div className="border border-gray-700 rounded-xl p-6 bg-gray-900/50">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-white font-semibold">{selectedPlan.name} Plan</p>
                  <p className="text-gray-400 text-sm">
                    {selectedPlan.price}/month &middot; Billed monthly
                  </p>
                </div>
                <button
                  onClick={() => setState('idle')}
                  className="text-gray-500 hover:text-gray-300 text-sm underline"
                >
                  Edit details
                </button>
              </div>

              <PayPalButtons
                formData={formData}
                onSuccess={(id) => {
                  setOrderID(id);
                  setState('success');
                }}
                onError={(msg) => {
                  setErrorMsg(msg);
                  setState('error');
                }}
              />
            </div>
          </div>
        )}

        {/* Footer note */}
        <p className="text-center text-gray-500 text-sm mt-8">
          Questions? Email us at{' '}
          <a href="mailto:hello@evallab.ai" className="text-primary-400 hover:text-primary-300">
            hello@evallab.ai
          </a>
        </p>
      </div>
    </main>
  );
}
