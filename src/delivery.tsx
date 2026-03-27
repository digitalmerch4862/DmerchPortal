import React, { FormEvent, useEffect, useMemo, useState, useCallback } from 'react';
import { Download, ShieldCheck, ExternalLink } from 'lucide-react';
import { DEFAULT_PROMO_CARDS, resolvePromoImageUrl, sanitizePromoCards, type PromoCard } from './lib/promo-cards';

const APP_BASE_URL = (import.meta.env.VITE_APP_BASE_URL || 'https://paymentportal.digitalmerchs.store').replace(/\/+$/, '');
const FALLBACK_API_BASE_URLS = [
  APP_BASE_URL,
  'https://paymentportal.digitalmerchs.store',
  'https://dmerchportal.digitalmerchs.store',
  'https://digitalmerchs.store',
].map((value) => value.replace(/\/+$/, ''));

const getCandidateApiBaseUrls = () => {
  const currentOrigin = window.location.origin.replace(/\/+$/, '');
  return Array.from(new Set([currentOrigin, ...FALLBACK_API_BASE_URLS]));
};

type DeliveryProduct = {
  name: string;
  amount: number;
  os?: string;
  downloadCount?: number;
  status?: 'approved' | 'rejected';
};

type DeliveryAuthResponse = {
  ok: boolean;
  token?: string;
  serialNo?: string;
  products?: DeliveryProduct[];
  error?: string;
};

// Check if we're on the wrong/old domain and redirect if so
const checkAndRedirect = () => {
  const currentOrigin = window.location.origin;
  const newOrigin = APP_BASE_URL;
  if (currentOrigin !== newOrigin) {
    const newUrl = newOrigin + window.location.pathname + window.location.search;
    window.location.replace(newUrl);
    return true;
  }
  return false;
};

export default function Delivery() {
  const [email, setEmail] = useState('');
  const [serialNo, setSerialNo] = useState('');
  const [token, setToken] = useState('');
  const [products, setProducts] = useState<DeliveryProduct[]>([]);
  const [status, setStatus] = useState('Authenticate using your email and order serial to access your downloads.');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [downloadingProduct, setDownloadingProduct] = useState('');
  const [downloadSuccess, setDownloadSuccess] = useState<Record<string, string>>({});
  const [downloadErrors, setDownloadErrors] = useState<Record<string, string>>({});
  const [apiUnreachable, setApiUnreachable] = useState(false);
  const [apiBaseUrl, setApiBaseUrl] = useState(() => window.location.origin.replace(/\/+$/, ''));
  const [promoCards, setPromoCards] = useState<PromoCard[]>([...DEFAULT_PROMO_CARDS]);

  const requestDeliveryApi = useCallback(async (path: 'auth' | 'download', body: Record<string, unknown>) => {
    const origins = [apiBaseUrl, ...getCandidateApiBaseUrls()].filter(Boolean);
    const uniqueOrigins = Array.from(new Set(origins));
    let lastResponse: Response | null = null;
    let lastPayload: any = null;
    let lastError: unknown = null;

    for (const origin of uniqueOrigins) {
      try {
        const response = await fetch(`${origin}/api/delivery?path=${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        lastResponse = response;
        let payload: any = null;
        try {
          payload = await response.json();
        } catch {
          payload = null;
        }

        if (response.status === 404) {
          continue;
        }

        setApiBaseUrl(origin);
        return { response, payload, origin };
      } catch (error) {
        lastError = error;
      }
    }

    if (lastResponse) {
      return { response: lastResponse, payload: lastPayload, origin: apiBaseUrl };
    }

    throw lastError ?? new Error('Delivery API is unreachable.');
  }, [apiBaseUrl]);

  // On mount: if on wrong domain, auto-redirect preserving the access token
  useEffect(() => {
    if (checkAndRedirect()) {
      setRedirecting(true);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const access = params.get('access') ?? params.get('token') ?? '';
    if (access) {
      setToken(access);
    }
  }, []);

  useEffect(() => {
    if (!token) return;

    const autoAuth = async () => {
      setLoading(true);
      setError('');
      try {
        const { response, payload } = await requestDeliveryApi('auth', { token });
        const typedPayload = payload as DeliveryAuthResponse | null;
        if (!typedPayload) {
          setError(`Server returned an invalid response (HTTP ${response.status}). Please try verifying manually.`);
          setToken('');
          return;
        }
        if (!response.ok || !typedPayload.ok || !typedPayload.token) {
          setError(typedPayload.error ?? 'Access link is invalid. Please verify manually.');
          setToken('');
          return;
        }
        setToken(typedPayload.token);
        setSerialNo(typedPayload.serialNo ?? '');
        setProducts(typedPayload.products ?? []);
        setStatus('Access granted. You may now download your purchased products.');
        setApiUnreachable(false);
      } catch (err) {
        setError(`Could not validate access link: ${err instanceof Error ? err.message : 'network error'}. Please try verifying manually below.`);
        setApiUnreachable(true);
        setToken('');
      } finally {
        setLoading(false);
      }
    };

    void autoAuth();
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    const loadPromoCards = async () => {
      try {
        const response = await fetch('/api/promo-cards');
        const payload = (await response.json()) as { ok?: boolean; cards?: unknown[] };
        if (!cancelled && payload?.ok) {
          setPromoCards(sanitizePromoCards(payload.cards ?? []));
        }
      } catch {
        // Keep defaults if API is unavailable.
      }
    };
    void loadPromoCards();
    return () => {
      cancelled = true;
    };
  }, []);

  const isAuthenticated = useMemo(() => token.length > 0 && products.length > 0, [products.length, token.length]);

  const sortedProducts = useMemo(() => {
    return [...products].sort((a, b) => {
      const aRejected = a.status === 'rejected';
      const bRejected = b.status === 'rejected';
      if (aRejected !== bRejected) {
        return aRejected ? 1 : -1;
      }
      return a.name.localeCompare(b.name);
    });
  }, [products]);

  const handleManualAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setApiUnreachable(false);
    setStatus('Verifying your order details...');

    try {
      const { response, payload } = await requestDeliveryApi('auth', { email, serialNo });
      const typedPayload = payload as DeliveryAuthResponse | null;
      if (!typedPayload) {
        setError(`Server returned an invalid response (HTTP ${response.status}).`);
        setStatus('Authentication failed.');
        return;
      }

      if (!response.ok || !typedPayload.ok || !typedPayload.token) {
        setError(typedPayload.error ?? 'Invalid email or serial number. Please double-check and try again.');
        setStatus('Authentication failed.');
        return;
      }
      setToken(typedPayload.token);
      setProducts(typedPayload.products ?? []);
      setStatus('Access granted. You may now download your purchased products.');
      setApiUnreachable(false);
    } catch {
      setError('Unable to verify order right now. Please retry.');
      setApiUnreachable(true);
      setStatus('Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  const triggerSecureDownload = useCallback(async (productName: string) => {
    setDownloadErrors((prev) => ({ ...prev, [productName]: '' }));
    setDownloadingProduct(productName);

    try {
      const { response, payload } = await requestDeliveryApi('download', { token, productName });
      const typedPayload = payload as { ok: boolean; downloadTicket?: string; error?: string; products?: DeliveryProduct[] } | null;

      if (!typedPayload) {
        setDownloadErrors((prev) => ({
          ...prev,
          [productName]: `Server returned an invalid response (HTTP ${response.status}).`,
        }));
        return;
      }

      if (!typedPayload.ok || !typedPayload.downloadTicket) {
        setDownloadErrors((prev) => ({
          ...prev,
          [productName]: typedPayload.error ?? 'Download is not available right now. Please try again.',
        }));
        if (typedPayload.products) setProducts(typedPayload.products);
        return;
      }

      if (typedPayload.products) setProducts(typedPayload.products);

      const downloadUrl = `${apiBaseUrl}/api/delivery?path=file&ticket=${encodeURIComponent(typedPayload.downloadTicket)}&cb=${Date.now()}`;
      window.open(downloadUrl, '_blank');

      setDownloadSuccess((prev) => ({ ...prev, [productName]: 'Downloading... Check your browser tray.' }));
      setTimeout(() => setDownloadSuccess((prev) => ({ ...prev, [productName]: '' })), 7000);
    } catch (err: any) {
      console.error('Download error:', err);
      setDownloadErrors((prev) => ({
        ...prev,
        [productName]: 'Download connection failed. Please check your internet and try again.',
      }));
      setApiUnreachable(true);
    } finally {
      setDownloadingProduct('');
    }
  }, [apiBaseUrl, requestDeliveryApi, token]);

  // Build the correct delivery URL on the new domain for this session
  const newDomainUrl = `${APP_BASE_URL}/delivery${window.location.search}`;

  if (redirecting) {
    return (
      <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center px-4">
        <div className="text-center space-y-3">
          <p className="text-cyan-300 text-sm font-mono uppercase tracking-widest">Redirecting...</p>
          <p className="text-xs text-cyan-100/60">Taking you to the new delivery portal.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white px-4 py-10">
      <main className="mx-auto max-w-3xl space-y-4">
        <section className="rounded-xl border border-cyan-500/35 bg-[#071018]/85 p-5">
          <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-cyan-300">DMerch Delivery</p>
          <h1 className="mt-2 text-2xl font-black uppercase tracking-[0.1em] text-cyan-100">Secure Download Access</h1>
          <p className="mt-2 text-xs text-cyan-100/80">{status}</p>
          {error ? <p className="mt-2 text-xs text-red-300">{error}</p> : null}
        </section>

        {/* Show redirect notice if API is unreachable (old domain) */}
        {apiUnreachable && (
          <section className="rounded-xl border border-red-500/50 bg-[#1a0505]/90 p-4">
            <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-red-300 mb-2">⚠ Wrong Domain Detected</p>
            <p className="text-xs text-red-100/80 mb-3">
              You are accessing this page from an old link. Please use the new delivery portal link below to access your downloads.
            </p>
            <a
              href={newDomainUrl}
              className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-xs font-bold uppercase tracking-widest text-black hover:bg-cyan-400 transition-colors"
            >
              <ExternalLink size={13} />
              Go to New Delivery Portal
            </a>
          </section>
        )}

        <section className="rounded-xl border border-amber-500/35 bg-[#171005]/80 p-4">
          <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-amber-200">Visit Us</p>
          <p className="mt-2 text-xs text-amber-100/90 leading-relaxed">
            Visit us at{' '}
            <a
              href={APP_BASE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-amber-300 underline decoration-amber-400/70 underline-offset-2 hover:text-amber-200"
            >
              {APP_BASE_URL.replace(/^https?:\/\//, '')}
            </a>{' '}
            or on{' '}
            <a
              href="https://www.facebook.com/digitalmerch4862/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-amber-300 underline decoration-amber-400/70 underline-offset-2 hover:text-amber-200"
            >
              Facebook
            </a>{' '}
            for more products and updates.
          </p>
        </section>

        <section className="rounded-xl border border-cyan-500/30 bg-[#041019]/80 p-4">
          <p className="mb-3 text-[11px] font-mono uppercase tracking-[0.2em] text-cyan-300">Promos</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {promoCards.map((card, index) => {
              const imageSrc = resolvePromoImageUrl(card.imageUrl);
              const hasImage = imageSrc.length > 0;
              return (
                <a
                  key={`${card.title}-${index}`}
                  href={card.href || undefined}
                  target={card.href ? '_blank' : undefined}
                  rel={card.href ? 'noreferrer noopener' : undefined}
                  className="group relative overflow-visible rounded-lg border border-cyan-500/25 bg-black/35"
                >
                  <div className="h-28 w-full">
                    {hasImage ? (
                      <img src={imageSrc} alt={card.title} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-[10px] font-mono uppercase tracking-[0.14em] text-cyan-300/70">
                        No promo image
                      </div>
                    )}
                  </div>
                  <p className="border-t border-cyan-500/20 px-2 py-2 text-[10px] font-mono uppercase tracking-[0.14em] text-cyan-100">
                    {card.title || `Promo Slot ${index + 1}`}
                  </p>
                  {hasImage ? (
                    <div className="pointer-events-none fixed inset-0 z-[70] hidden items-center justify-center bg-black/45 p-4 group-hover:flex">
                      <img
                        src={imageSrc}
                        alt={`${card.title} zoom`}
                        className="h-auto w-[68vw] max-w-[620px] max-h-[58vh] rounded-lg border border-cyan-300/70 bg-[#02070d]/95 p-1 object-contain shadow-[0_0_35px_rgba(0,243,255,0.35)]"
                      />
                    </div>
                  ) : null}
                </a>
              );
            })}
          </div>
        </section>

        {!isAuthenticated ? (
          <section className="rounded-xl border border-cyan-500/30 bg-[#041019]/80 p-5">
            <form onSubmit={handleManualAuth} className="space-y-3">
              <label className="block text-xs text-cyan-300">
                Email
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full rounded-md border border-cyan-500/35 bg-black/40 px-3 py-2 text-sm"
                  placeholder="buyer@email.com" />
              </label>
              <label className="block text-xs text-cyan-300">
                Order Serial
                <input required value={serialNo} onChange={(e) => setSerialNo(e.target.value.toUpperCase())}
                  className="mt-1 w-full rounded-md border border-cyan-500/35 bg-black/40 px-3 py-2 text-sm"
                  placeholder="DMERCH-2026FEB26-011" />
              </label>
              <button disabled={loading} className="cyber-btn cyber-btn-primary w-full" type="submit">
                <ShieldCheck size={14} /> {loading ? 'Verifying...' : 'Verify and Access Downloads'}
              </button>
            </form>
          </section>
        ) : (
          <section className="rounded-xl border border-cyan-500/30 bg-[#041019]/80 p-5">
            <p className="mb-3 text-[11px] font-mono uppercase tracking-[0.2em] text-cyan-300">Purchased Products</p>
            <div className="space-y-2">
              {sortedProducts.map((product, index) => (
                <div key={`${product.name}-${index}`} className="rounded-md border border-cyan-500/25 bg-black/35 px-3 py-3">
                  <p className="text-sm font-semibold text-cyan-50">{product.name}</p>
                  <p className="mt-1 text-xs text-cyan-200">OS: {product.os ?? 'Multi'} | Amount: PHP {product.amount}</p>
                  {product.status === 'rejected' ? (
                    <p className="mt-1 text-[10px] font-mono uppercase tracking-[0.2em] text-red-300">Cancelled</p>
                  ) : null}
                  <div className="mt-3">
                    <button
                      type="button"
                      className="cyber-btn cyber-btn-primary"
                      onClick={() => { void triggerSecureDownload(product.name); }}
                      disabled={downloadingProduct === product.name || product.status === 'rejected'}>
                      <Download size={14} /> {product.status === 'rejected' ? 'Cancelled' : (downloadingProduct === product.name ? 'Starting...' : 'Download')}
                    </button>
                    {downloadSuccess[product.name] ? (
                      <p className="mt-2 text-xs text-green-400 font-medium">{downloadSuccess[product.name]}</p>
                    ) : null}
                    {downloadErrors[product.name] ? (
                      <p className="mt-2 text-xs text-red-300">{downloadErrors[product.name]}</p>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
