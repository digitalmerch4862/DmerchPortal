import React, { FormEvent, useEffect, useMemo, useState, useCallback } from 'react';
import { Download, ShieldCheck, X } from 'lucide-react';

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

const DOWNLOAD_STATUS_STEPS = [
  'Verifying your order...',
  'Authenticating access...',
  'Securing download link...',
  'Almost ready — hang tight...',
];

export default function Delivery() {
  const [email, setEmail] = useState('');
  const [serialNo, setSerialNo] = useState('');
  const [token, setToken] = useState('');
  const [products, setProducts] = useState<DeliveryProduct[]>([]);
  const [status, setStatus] = useState('Authenticate using your email and order serial to access your downloads.');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [activeProduct, setActiveProduct] = useState<DeliveryProduct | null>(null);
  const [modalPhase, setModalPhase] = useState<'confirm' | 'loading' | 'done' | 'error'>('confirm');
  const [progress, setProgress] = useState(0);
  const [modalError, setModalError] = useState('');

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

  const openDownloadModal = (product: DeliveryProduct) => {
    setActiveProduct(product);
    setShowModal(true);
    setModalPhase('confirm');
    setProgress(0);
    setModalError('');
  };

  const closeModal = useCallback(() => {
    setShowModal(false);
    setActiveProduct(null);
    setModalPhase('confirm');
    setProgress(0);
    setModalError('');
  }, []);

  const triggerSecureDownload = useCallback(() => {
    if (!activeProduct) return;
    const productName = activeProduct.name;

    setModalPhase('loading');
    setModalError('');

    fetch('/api/delivery-download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, productName }),
    })
      .then((r) => r.json())
      .then((payload: { ok: boolean; redirectUrl?: string; error?: string; products?: DeliveryProduct[] }) => {
        if (!payload.ok || !payload.redirectUrl) {
          setModalError(payload.error ?? 'Download is not available.');
          setModalPhase('error');
          if (payload.products) setProducts(payload.products);
          return;
        }
        if (payload.products) setProducts(payload.products);
        setModalPhase('done');
        // Navigate in same tab — browser triggers download dialog, no new tab opens
        window.location.href = payload.redirectUrl;
        setTimeout(() => closeModal(), 3000);
      })
      .catch(() => {
        setModalError('Download failed. Please try again.');
        setModalPhase('error');
      });
  }, [activeProduct, token, closeModal]);

  // ---- INLINE STYLES (guaranteed to work, no CSS dependency) ----
  const overlayStyle: React.CSSProperties = {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0, 5, 10, 0.9)',
    backdropFilter: 'blur(10px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 9999, padding: '20px',
  };

  const modalStyle: React.CSSProperties = {
    width: '100%', maxWidth: '460px',
    background: '#071018',
    border: '1px solid rgba(0, 243, 255, 0.4)',
    boxShadow: '0 0 60px rgba(0, 243, 255, 0.2), inset 0 0 20px rgba(0, 243, 255, 0.05)',
    borderRadius: '16px', padding: '28px',
    position: 'relative', overflow: 'hidden',
  };

  const progressContainerStyle: React.CSSProperties = {
    width: '100%', height: '8px',
    background: 'rgba(0, 243, 255, 0.1)',
    borderRadius: '4px', overflow: 'hidden',
    border: '1px solid rgba(0, 243, 255, 0.2)',
  };

  const progressBarStyle: React.CSSProperties = {
    height: '100%', width: `${progress}%`,
    background: 'linear-gradient(90deg, #00f3ff, #39f4b8, #ff00ff)',
    backgroundSize: '200% 100%',
    boxShadow: '0 0 12px rgba(0, 243, 255, 0.5)',
    transition: 'width 0.08s linear',
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
          <>
            <section className="rounded-xl border border-cyan-500/30 bg-[#041019]/80 p-5">
              <p className="mb-3 text-[11px] font-mono uppercase tracking-[0.2em] text-cyan-300">Purchased Products</p>
              <div className="space-y-2">
                {products.map((product, index) => (
                  <div key={`${product.name}-${index}`} className="rounded-md border border-cyan-500/25 bg-black/35 px-3 py-3">
                    <p className="text-sm font-semibold text-cyan-50">{product.name}</p>
                    <p className="mt-1 text-xs text-cyan-200">OS: {product.os ?? 'Multi'} | Amount: PHP {product.amount}</p>
                    <div className="mt-3">
                      <button type="button" className="cyber-btn cyber-btn-primary"
                        onClick={() => openDownloadModal(product)}>
                        <Download size={14} /> Download
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-amber-500/35 bg-[#171005]/80 p-4">
              <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-amber-200">Visit Us</p>
              <p className="mt-2 text-xs text-amber-100/90">
                Visit us at{' '}
                <a
                  href="https://paymentportal.digitalmerch.store"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-amber-300 underline decoration-amber-400/70 underline-offset-2 hover:text-amber-200"
                >
                  paymentportal.digitalmerch.store
                </a>{' '}
                for more products.
              </p>
            </section>
          </>
        )}
      </main>

      {/* ===== DOWNLOAD MODAL ===== */}
      {showModal && activeProduct && (
        <div style={overlayStyle} onClick={() => { if (modalPhase === 'confirm') closeModal(); }}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            {/* Top accent bar */}
            <div style={{
              position: 'absolute', top: 0, left: 0, width: '100%', height: '2px',
              background: 'linear-gradient(90deg, transparent, #00f3ff, transparent)'
            }} />

            {/* Close button (confirm phase only) */}
            {modalPhase === 'confirm' && (
              <button onClick={closeModal} style={{
                position: 'absolute', top: '12px', right: '12px',
                background: 'none', border: 'none', color: '#67e8f9', cursor: 'pointer', padding: '4px',
              }}>
                <X size={18} />
              </button>
            )}

            <h3 style={{
              fontSize: '16px', fontWeight: 700, color: '#e0f2fe',
              textTransform: 'uppercase', letterSpacing: '0.15em'
            }}>
              Secure File Export
            </h3>

            <p style={{ marginTop: '10px', fontSize: '13px', color: 'rgba(186, 230, 253, 0.75)' }}>
              {modalPhase === 'confirm' && <><b style={{ color: '#fff' }}>{activeProduct.name}</b> — Ready to download</>}
              {modalPhase === 'loading' && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{
                    display: 'inline-block', width: '12px', height: '12px',
                    border: '2px solid rgba(0,243,255,0.3)',
                    borderTop: '2px solid #00f3ff',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                  }} />
                  Securing your download — please wait a moment...
                </span>
              )}
              {modalPhase === 'done' && 'Download started! Check your Downloads folder.'}
              {modalPhase === 'error' && 'An error occurred during the download.'}
            </p>

            <div style={{ marginTop: '24px' }}>
              {/* CONFIRM: Cancel + Save */}
              {modalPhase === 'confirm' && (
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button onClick={closeModal} style={{
                    flex: 1, padding: '10px 16px', fontSize: '11px', fontWeight: 700,
                    textTransform: 'uppercase', letterSpacing: '0.15em',
                    color: '#67e8f9', background: 'transparent',
                    border: '1px solid rgba(0, 243, 255, 0.3)',
                    borderRadius: '8px', cursor: 'pointer',
                  }}>Cancel</button>
                  <button onClick={triggerSecureDownload} className="cyber-btn cyber-btn-primary"
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                    <Download size={14} /> Save File
                  </button>
                </div>
              )}

              {/* LOADING: spinner only */}
              {modalPhase === 'loading' && (
                <div style={{ textAlign: 'center', padding: '8px 0' }}>
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                  <div style={{
                    display: 'inline-block', width: '32px', height: '32px',
                    border: '3px solid rgba(0,243,255,0.2)',
                    borderTop: '3px solid #00f3ff',
                    borderRadius: '50%',
                    animation: 'spin 0.9s linear infinite',
                  }} />
                  <p style={{ marginTop: '10px', fontSize: '11px', color: 'rgba(186,230,253,0.5)', fontFamily: 'monospace' }}>
                    Your download will begin automatically. Check your Downloads folder.
                  </p>
                </div>
              )}

              {/* DONE: Success */}
              {modalPhase === 'done' && (
                <div style={{ textAlign: 'center' }}>
                  <p style={{
                    fontSize: '11px', color: '#34d399', fontFamily: 'monospace',
                    textTransform: 'uppercase', letterSpacing: '0.15em'
                  }}>
                    ✓ Download Complete — 100%
                  </p>
                  <p style={{ fontSize: '11px', color: 'rgba(186, 230, 253, 0.5)', marginTop: '8px' }}>
                    This modal will close automatically...
                  </p>
                </div>
              )}

              {/* ERROR */}
              {modalPhase === 'error' && (
                <div>
                  <p style={{ fontSize: '12px', color: '#f87171', textAlign: 'center', marginBottom: '12px' }}>
                    {modalError}
                  </p>
                  <button onClick={closeModal} style={{
                    width: '100%', padding: '10px', fontSize: '11px', fontWeight: 700,
                    textTransform: 'uppercase', letterSpacing: '0.1em',
                    color: '#67e8f9', background: 'transparent',
                    border: '1px solid rgba(0, 243, 255, 0.3)',
                    borderRadius: '8px', cursor: 'pointer',
                  }}>Close</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
