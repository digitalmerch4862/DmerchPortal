import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Download, ShieldCheck } from 'lucide-react';

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

export default function Delivery() {
  const [email, setEmail] = useState('');
  const [serialNo, setSerialNo] = useState('');
  const [token, setToken] = useState('');
  const [products, setProducts] = useState<DeliveryProduct[]>([]);
  const [status, setStatus] = useState('Authenticate using your email and order serial to access your downloads.');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [downloadingProduct, setDownloadingProduct] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({});

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const access = params.get('access') ?? params.get('token') ?? '';
    if (access) {
      setToken(access);
    }
  }, []);

  useEffect(() => {
    if (!token) {
      return;
    }

    const autoAuth = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch('/api/delivery-auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const payload = (await response.json()) as DeliveryAuthResponse;
        if (!response.ok || !payload.ok || !payload.token) {
          setError(payload.error ?? 'Access link is invalid. Please verify manually.');
          setToken('');
          return;
        }

        setToken(payload.token);
        setSerialNo(payload.serialNo ?? '');
        setProducts(payload.products ?? []);
        setStatus('Access granted. You may now download your purchased products.');
      } catch {
        setError('Could not validate access link. Please try again.');
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
    setStatus('Verifying your order details...');

    try {
      const response = await fetch('/api/delivery-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, serialNo }),
      });
      const payload = (await response.json()) as DeliveryAuthResponse;
      if (!response.ok || !payload.ok || !payload.token) {
        setError(payload.error ?? 'Invalid email or serial number.');
        setStatus('Authentication failed.');
        return;
      }

      setToken(payload.token);
      setProducts(payload.products ?? []);
      setStatus('Access granted. You may now download your purchased products.');
    } catch {
      setError('Unable to verify order right now. Please retry.');
      setStatus('Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = (productName: string) => {
    setDownloadingProduct(productName);
    setDownloadProgress(prev => ({ ...prev, [productName]: 0 }));
    setError('');

    let redirectUrl: string | null = null;
    let fetchError: string | null = null;
    let fetchDone = false;

    // Start background fetch immediately
    const startFetch = async () => {
      try {
        const response = await fetch('/api/delivery-download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, productName }),
        });

        const payload = (await response.json()) as { ok: boolean; redirectUrl?: string; error?: string; products?: DeliveryProduct[] };
        if (!response.ok || !payload.ok || !payload.redirectUrl) {
          fetchError = payload.error ?? 'Download is not available.';
          if (payload.products) {
            setProducts(payload.products);
          }
        } else {
          redirectUrl = payload.redirectUrl;
          if (payload.products) {
            setProducts(payload.products);
          }
        }
      } catch {
        fetchError = 'Download failed. Please try again.';
      } finally {
        fetchDone = true;
      }
    };

    void startFetch();

    // Progress animation (Fake Security Scan / Download Prep)
    const duration = 2000; // 2 seconds target
    const interval = 50;   // Update every 50ms
    const steps = duration / interval;
    let currentStep = 0;

    const timer = setInterval(() => {
      currentStep++;
      let progress = Math.min(Math.round((currentStep / steps) * 100), 99);

      // If fetch is done and we reached 100%, trigger
      if (fetchDone) {
        if (fetchError) {
          clearInterval(timer);
          setError(fetchError);
          setDownloadingProduct(null);
          return;
        }

        // Final transition to 100
        progress = 100;
        setDownloadProgress(prev => ({ ...prev, [productName]: progress }));
        clearInterval(timer);

        // Trigger actual download via hidden iframe
        if (redirectUrl) {
          const iframe = document.createElement('iframe');
          iframe.style.display = 'none';
          iframe.src = redirectUrl;
          document.body.appendChild(iframe);
          setTimeout(() => {
            if (document.body.contains(iframe)) {
              document.body.removeChild(iframe);
            }
          }, 60000);
        }

        // Keep progress at 100 for a moment then reset
        setTimeout(() => {
          setDownloadingProduct(prev => prev === productName ? null : prev);
          setDownloadProgress(prev => {
            const next = { ...prev };
            delete next[productName];
            return next;
          });
        }, 1500);
      } else {
        // Hold at 99 if fetch is slow
        setDownloadProgress(prev => ({ ...prev, [productName]: progress }));
      }
    }, interval);
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white px-4 py-10">
      <main className="mx-auto max-w-3xl space-y-4">
        <section className="rounded-xl border border-cyan-500/35 bg-[#071018]/85 p-5">
          <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-cyan-300">DMerch Delivery</p>
          <h1 className="mt-2 text-2xl font-black uppercase tracking-[0.1em] text-cyan-100">Secure Download Access</h1>
          <p className="mt-2 text-xs text-cyan-100/80">{status}</p>
          {error ? <p className="mt-2 text-xs text-red-300">{error}</p> : null}
        </section>

        {!isAuthenticated ? (
          <section className="rounded-xl border border-cyan-500/30 bg-[#041019]/80 p-5">
            <form onSubmit={handleManualAuth} className="space-y-3">
              <label className="block text-xs text-cyan-300">
                Email
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="mt-1 w-full rounded-md border border-cyan-500/35 bg-black/40 px-3 py-2 text-sm"
                  placeholder="buyer@email.com"
                />
              </label>
              <label className="block text-xs text-cyan-300">
                Order Serial
                <input
                  required
                  value={serialNo}
                  onChange={(event) => setSerialNo(event.target.value.toUpperCase())}
                  className="mt-1 w-full rounded-md border border-cyan-500/35 bg-black/40 px-3 py-2 text-sm"
                  placeholder="DMERCH-2026FEB26-011"
                />
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
                    {downloadingProduct === product.name ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="download-status-tag">
                            {downloadProgress[product.name] < 100 ? 'Securing Channel...' : 'Verified. Starting Download...'}
                          </span>
                          <span className="text-[10px] text-cyan-400 font-mono">{downloadProgress[product.name]}%</span>
                        </div>
                        <div className="cyber-progress-container">
                          <div
                            className="cyber-progress-bar"
                            style={{ width: `${downloadProgress[product.name]}%` }}
                          />
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="cyber-btn cyber-btn-primary"
                        onClick={() => {
                          handleDownload(product.name);
                        }}
                      >
                        <Download size={14} /> Download
                      </button>
                    )}
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
