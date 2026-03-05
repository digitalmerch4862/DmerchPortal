import React, { FormEvent, useEffect, useMemo, useState, useCallback } from 'react';
import { Download, ShieldCheck, ExternalLink } from 'lucide-react';

const NEW_DOMAIN = 'https://dmerchportal.digitalmerchs.store';

type DeliveryProduct = {
  name: string;
  amount: number;
  os?: string;
  downloadCount?: number;
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
  const newOrigin = NEW_DOMAIN;
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
        const response = await fetch('/api/delivery?path=auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        let payload: DeliveryAuthResponse;
        try {
          payload = (await response.json()) as DeliveryAuthResponse;
        } catch {
          // Silently fall back to manual form — no error shown
          setToken('');
          return;
        }
        if (!response.ok || !payload.ok || !payload.token) {
          // Silently fall back to manual form
          setToken('');
          return;
        }
        setToken(payload.token);
        setSerialNo(payload.serialNo ?? '');
        setProducts(payload.products ?? []);
        setStatus('Access granted. You may now download your purchased products.');
      } catch {
        // Network failure — silently show manual form
        setToken('');
      } finally {
        setLoading(false);
      }
    };

    void autoAuth();
  }, [token]);

  const isAuthenticated = useMemo(() => token.length > 0 && products.length > 0, [products.length, token.length]);

  const handleManualAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setApiUnreachable(false);
    setStatus('Verifying your order details...');

    try {
      const response = await fetch('/api/delivery?path=auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, serialNo }),
      });

      let payload: DeliveryAuthResponse;
      try {
        payload = (await response.json()) as DeliveryAuthResponse;
      } catch {
        setApiUnreachable(true);
        setStatus('Authenticate using your email and order serial to access your downloads.');
        return;
      }

      if (!response.ok || !payload.ok || !payload.token) {
        setError(payload.error ?? 'Invalid email or serial number. Please double-check and try again.');
        setStatus('Authentication failed.');
        return;
      }
      setToken(payload.token);
      setProducts(payload.products ?? []);
      setStatus('Access granted. You may now download your purchased products.');
    } catch {
      setApiUnreachable(true);
      setStatus('Authenticate using your email and order serial to access your downloads.');
    } finally {
      setLoading(false);
    }
  };

  const triggerSecureDownload = useCallback(async (productName: string) => {
    setDownloadErrors((prev) => ({ ...prev, [productName]: '' }));
    setDownloadingProduct(productName);

    try {
      const response = await fetch('/api/delivery?path=download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, productName }),
      });
      const payload = (await response.json()) as { ok: boolean; downloadTicket?: string; error?: string; products?: DeliveryProduct[] };

      if (!payload.ok || !payload.downloadTicket) {
        setDownloadErrors((prev) => ({
          ...prev,
          [productName]: payload.error ?? 'Download is not available right now. Please try again.',
        }));
        if (payload.products) setProducts(payload.products);
        return;
      }

      if (payload.products) setProducts(payload.products);

      const downloadUrl = `/api/delivery?path=file&ticket=${encodeURIComponent(payload.downloadTicket)}&cb=${Date.now()}`;
      window.open(downloadUrl, '_blank');

      setDownloadSuccess((prev) => ({ ...prev, [productName]: 'Downloading... Check your browser tray.' }));
      setTimeout(() => setDownloadSuccess((prev) => ({ ...prev, [productName]: '' })), 7000);
    } catch (err: any) {
      console.error('Download error:', err);
      setDownloadErrors((prev) => ({
        ...prev,
        [productName]: 'Download connection failed. Please check your internet and try again.',
      }));
    } finally {
      setDownloadingProduct('');
    }
  }, [token]);

  // Build the correct delivery URL on the new domain for this session
  const newDomainUrl = `${NEW_DOMAIN}/delivery${window.location.search}`;

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
          <p className="mt-2 text-xs text-amber-100/90">
            Visit us at{' '}
            <a
              href="https://dmerchportal.digitalmerchs.store"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-amber-300 underline decoration-amber-400/70 underline-offset-2 hover:text-amber-200"
            >
              dmerchportal.digitalmerchs.store
            </a>{' '}
            for more products.
          </p>
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
              {products.map((product, index) => (
                <div key={`${product.name}-${index}`} className="rounded-md border border-cyan-500/25 bg-black/35 px-3 py-3">
                  <p className="text-sm font-semibold text-cyan-50">{product.name}</p>
                  <p className="mt-1 text-xs text-cyan-200">OS: {product.os ?? 'Multi'} | Amount: PHP {product.amount}</p>
                  <div className="mt-3">
                    <button type="button" className="cyber-btn cyber-btn-primary"
                      onClick={() => { void triggerSecureDownload(product.name); }}
                      disabled={downloadingProduct === product.name}>
                      <Download size={14} /> {downloadingProduct === product.name ? 'Starting...' : 'Download'}
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
