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
  const [showModal, setShowModal] = useState(false);
  const [activeProduct, setActiveProduct] = useState<DeliveryProduct | null>(null);

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

  const handleDownload = (product: DeliveryProduct) => {
    setActiveProduct(product);
    setShowModal(true);
    setDownloadingProduct(null); // Reset from previous if any
  };

  const triggerSecureDownload = (productName: string) => {
    setDownloadingProduct(productName);
    setDownloadProgress(prev => ({ ...prev, [productName]: 0 }));
    setError('');

    let redirectUrl: string | null = null;
    let fetchError: string | null = null;
    let fetchDone = false;

    // Start background fetch immediately (simulating link generation)
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
          if (payload.products) setProducts(payload.products);
        } else {
          redirectUrl = payload.redirectUrl;
          if (payload.products) setProducts(payload.products);
        }
      } catch {
        fetchError = 'Download failed. Please try again.';
      } finally {
        fetchDone = true;
      }
    };

    void startFetch();

    // Progress animation (Visual Secure Scan)
    const duration = 2000;
    const interval = 50;
    const steps = duration / interval;
    let currentStep = 0;

    const timer = setInterval(() => {
      currentStep++;
      let progress = Math.min(Math.round((currentStep / steps) * 100), 100);
      setDownloadProgress(prev => ({ ...prev, [productName]: progress }));

      if (currentStep >= steps) {
        clearInterval(timer);

        // Wait for fetch to complete if it's slow
        const checkDone = setInterval(() => {
          if (fetchDone) {
            clearInterval(checkDone);
            if (fetchError) {
              setError(fetchError);
              setDownloadingProduct(null);
            } else if (redirectUrl) {
              // Trigger actual download via hidden iframe
              const iframe = document.createElement('iframe');
              iframe.style.display = 'none';
              iframe.src = redirectUrl;
              document.body.appendChild(iframe);
              setTimeout(() => {
                if (document.body.contains(iframe)) document.body.removeChild(iframe);
              }, 60000);

              // Auto-close modal after success
              setTimeout(() => {
                setShowModal(false);
                setDownloadingProduct(null);
                setActiveProduct(null);
              }, 2000);
            }
          }
        }, 100);
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
                    <button
                      type="button"
                      className="cyber-btn cyber-btn-primary"
                      onClick={() => {
                        handleDownload(product);
                      }}
                    >
                      <Download size={14} /> Download
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Download Modal */}
      {showModal && activeProduct && (
        <div className="cyber-modal-overlay">
          <div className="cyber-modal-content">
            <h3 className="text-lg font-bold text-cyan-100 uppercase tracking-wider">Secure File Export</h3>
            <p className="mt-2 text-sm text-cyan-200/80">
              You are about to export: <span className="text-white font-semibold">{activeProduct.name}</span>
            </p>

            <div className="mt-6">
              {downloadingProduct === activeProduct.name ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="download-status-tag">
                      {downloadProgress[activeProduct.name] < 100 ? 'Securing Link & Encrypting...' : 'Encrypted. Starting Save...'}
                    </span>
                    <span className="text-xs text-cyan-400 font-mono">{downloadProgress[activeProduct.name]}%</span>
                  </div>
                  <div className="cyber-progress-container h-2">
                    <div
                      className="cyber-progress-bar"
                      style={{ width: `${downloadProgress[activeProduct.name]}%` }}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowModal(false)}
                    className="flex-1 px-4 py-2 text-xs font-bold uppercase tracking-widest text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/10 transition-colors rounded"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => triggerSecureDownload(activeProduct.name)}
                    className="flex-1 cyber-btn cyber-btn-primary"
                  >
                    <Download size={14} /> Save File
                  </button>
                </div>
              )}
            </div>

            {error ? <p className="mt-4 text-xs text-red-400 text-center">{error}</p> : null}
          </div>
        </div>
      )}
    </div>
  );
}
