/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { type ComponentType, type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldCheck, Facebook, Youtube, Instagram, Download, Search, Check, Plus, X, PackageSearch, ArrowRight, ArrowLeft, Lock } from 'lucide-react';
import gcashQr from './gcash-qr.png';
import gotymeQr from './gotyme-qr.png';
import { findProductByName, productCatalog, type ProductItem } from './data/products';

// Cyberpunk Theme Constants
const COLORS = {
  bg: '#050505',
  cyan: '#00f3ff',
  magenta: '#ff00ff',
  yellow: '#fcee0a',
  darkCyan: '#008b91',
  darkMagenta: '#910091',
};

type VerificationApiResponse = {
  ok: boolean;
  serialNo?: string;
  sequenceNo?: number;
  createdAt?: string;
  emailStatus?: string;
  totalAmount?: number;
  error?: string;
};

type FlowStage = 1 | 2 | 3 | 4;

function GlitchText({text, className = ''}: {text: string; className?: string}) {
  return (
    <div className={`relative inline-block ${className}`}>
      <span className="relative z-10">{text}</span>
      <span className="absolute top-0 left-0 -ml-0.5 text-cyan-400 opacity-70 animate-pulse select-none z-0" style={{clipPath: 'inset(45% 0 30% 0)'}}>{text}</span>
      <span className="absolute top-0 left-0 ml-0.5 text-magenta-400 opacity-70 animate-pulse select-none z-0" style={{clipPath: 'inset(10% 0 60% 0)'}}>{text}</span>
    </div>
  );
}

function CyberCard({children, title, icon: Icon, color = 'cyan'}: {children: ReactNode; title: string; icon: ComponentType<{className?: string; size?: number}>; color?: 'cyan' | 'magenta'}) {
  const isMagenta = color === 'magenta';
  const borderColor = color === 'cyan' ? 'border-[#00f3ff]' : 'border-[#ff00ff]';
  const shadowColor = color === 'cyan' ? 'shadow-[0_0_15px_rgba(0,243,255,0.3)]' : 'shadow-[0_0_15px_rgba(255,0,255,0.3)]';
  const textColor = color === 'cyan' ? 'text-[#00f3ff]' : 'text-[#ff00ff]';

  return (
    <motion.div
      initial={{opacity: 0, y: 20}}
      animate={{opacity: 1, y: 0}}
      className={`relative bg-black/80 p-4 sm:p-6 mb-4 sm:mb-6 ${shadowColor} backdrop-blur-md overflow-hidden ${isMagenta ? 'cyber-magenta-card border border-magenta-500/40' : `border-l-4 ${borderColor}`}`}
    >
      <div className="flex items-center gap-3 mb-4">
        <Icon className={textColor} size={24} />
        <h2 className={`text-xl font-bold tracking-widest uppercase ${textColor}`}>
          {title}
        </h2>
      </div>
      <div className="relative z-10 text-gray-300">{children}</div>
      <div className={`absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 ${borderColor} opacity-50`} />
      <div className={`absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 ${borderColor} opacity-50`} />
    </motion.div>
  );
}

function MethodCard({method, id, compact = false, selectedMethod, onSelectMethod}: {method: 'gcash' | 'gotyme'; id: string; compact?: boolean; selectedMethod: 'gcash' | 'gotyme'; onSelectMethod: (method: 'gcash' | 'gotyme') => void}) {
  const isActive = selectedMethod === method;
  const isGcash = method === 'gcash';

  return (
    <motion.button
      type="button"
      whileHover={{scale: 1.05}}
      whileTap={{scale: 0.95}}
      onClick={() => onSelectMethod(method)}
      className={`relative cursor-pointer transition-all duration-300 border-2 overflow-hidden ${compact ? 'w-36 h-36' : 'w-44 h-64'} ${
        isActive
          ? isGcash
            ? 'border-blue-500 bg-blue-500/20 shadow-[0_0_40px_rgba(0,125,254,0.5)]'
            : 'border-cyan-500 bg-cyan-500/20 shadow-[0_0_40px_rgba(0,229,255,0.5)]'
          : 'border-white/10 bg-white/5 grayscale hover:grayscale-0 opacity-40 hover:opacity-100'
      }`}
    >
      <div className={`absolute top-0 left-0 w-full h-full flex flex-col items-center justify-between ${compact ? 'p-4' : 'p-6'}`}>
        <div className="w-full flex justify-between items-start">
          <span className="text-[10px] font-mono opacity-50">ID: {id}</span>
          <div className={`w-2 h-2 rounded-full ${isActive ? (isGcash ? 'bg-blue-400 animate-pulse' : 'bg-cyan-400 animate-pulse') : 'bg-gray-700'}`} />
        </div>

        <div className="relative flex flex-col items-center justify-center gap-3 w-full">
          <div className={`absolute w-24 h-12 blur-2xl rounded-full ${isGcash ? 'bg-blue-500/50' : 'bg-cyan-400/50'}`} />
          <img
            src={isGcash ? '/gcash-logo.svg' : '/gotyme-logo.svg'}
            alt={isGcash ? 'GCash official logo' : 'GoTyme official logo'}
            className={`relative z-10 w-auto object-contain ${compact ? 'h-8' : 'h-10'}`}
            loading="lazy"
            referrerPolicy="no-referrer"
          />
          {!compact && (
            <span className="font-black tracking-[0.2em] uppercase text-lg italic">{isGcash ? 'GCash' : 'GoTyme'}</span>
          )}
        </div>

        <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
          <motion.div
            initial={{width: 0}}
            animate={{width: isActive ? '100%' : '30%'}}
            className={`h-full ${isGcash ? 'bg-blue-500' : 'bg-cyan-400'}`}
          />
        </div>
      </div>

      {isActive && <motion.div className={`absolute inset-0 border-2 animate-pulse pointer-events-none ${isGcash ? 'border-blue-400' : 'border-cyan-400'}`} />}
    </motion.button>
  );
}

export default function App() {
  const [stage, setStage] = useState<FlowStage>(1);
  const [selectedMethod, setSelectedMethod] = useState<'gcash' | 'gotyme'>('gcash');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [referenceNo, setReferenceNo] = useState('');
  const [productQuery, setProductQuery] = useState('');
  const [selectedProductName, setSelectedProductName] = useState('');
  const [selectedProducts, setSelectedProducts] = useState<ProductItem[]>([]);
  const [isProductMenuOpen, setIsProductMenuOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitProgress, setSubmitProgress] = useState(0);
  const [submitError, setSubmitError] = useState('');
  const [submitResult, setSubmitResult] = useState<VerificationApiResponse | null>(null);
  const productPickerRef = useRef<HTMLDivElement | null>(null);

  const selectedQrSrc = selectedMethod === 'gcash' ? gcashQr : gotymeQr;
  const selectedQrFilename = selectedMethod === 'gcash' ? 'dmerch-gcash-qr.png' : 'dmerch-gotyme-qr.png';

  const selectedProduct = useMemo(() => {
    if (!selectedProductName) {
      return null;
    }

    return findProductByName(selectedProductName);
  }, [selectedProductName]);

  const filteredProducts = useMemo(() => {
    const query = productQuery.trim().toLowerCase();
    if (!query) {
      return productCatalog.slice(0, 50);
    }

    return productCatalog
      .filter((item) => item.name.toLowerCase().includes(query))
      .slice(0, 75);
  }, [productQuery]);

  const totalAmount = useMemo(() => {
    return selectedProducts.reduce((sum, item) => sum + item.amount, 0);
  }, [selectedProducts]);

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const isEmailValid = emailPattern.test(email.trim());

  const canProceedFrom = (fromStage: FlowStage) => {
    if (fromStage === 1) {
      return selectedProducts.length > 0;
    }

    if (fromStage === 2) {
      return username.trim().length > 0 && isEmailValid;
    }

    if (fromStage === 3) {
      return Boolean(selectedMethod);
    }

    return true;
  };

  const stageErrorMessage: Record<FlowStage, string> = {
    1: 'Add at least one product before proceeding to client details.',
    2: 'Enter a valid username and email before proceeding to payment portal.',
    3: 'Select a payment portal before proceeding to confirmation.',
    4: '',
  };

  const goToNextStage = () => {
    if (stage === 4) {
      return;
    }

    if (!canProceedFrom(stage)) {
      setSubmitError(stageErrorMessage[stage]);
      return;
    }

    setSubmitError('');
    setStage((current) => (current < 4 ? ((current + 1) as FlowStage) : current));
  };

  const goToPreviousStage = () => {
    setSubmitError('');
    setStage((current) => (current > 1 ? ((current - 1) as FlowStage) : current));
  };

  const handleSelectStage = (targetStage: FlowStage) => {
    if (targetStage <= stage) {
      setSubmitError('');
      setStage(targetStage);
      return;
    }

    for (let check = stage; check < targetStage; check += 1) {
      if (!canProceedFrom(check as FlowStage)) {
        setSubmitError(stageErrorMessage[check as FlowStage]);
        return;
      }
    }

    setSubmitError('');
    setStage(targetStage);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const incomingProduct = params.get('product');
    if (!incomingProduct) {
      return;
    }

    const normalizedIncoming = decodeURIComponent(incomingProduct).trim().toLowerCase();
    const exactMatch = productCatalog.find((item) => item.name.toLowerCase() === normalizedIncoming);
    const fuzzyMatch = productCatalog.find((item) => item.name.toLowerCase().includes(normalizedIncoming));
    const resolved = exactMatch ?? fuzzyMatch;
    if (!resolved) {
      return;
    }

    setSelectedProductName(resolved.name);
    setProductQuery(resolved.name);
    setSelectedProducts([resolved]);
  }, []);

  useEffect(() => {
    if (!isSubmitting) {
      return;
    }

    setSubmitProgress(8);
    const timer = window.setInterval(() => {
      setSubmitProgress((current) => {
        if (current >= 94) {
          return current;
        }

        return Math.min(94, current + Math.max(1, Math.floor((100 - current) / 8)));
      });
    }, 180);

    return () => {
      window.clearInterval(timer);
    };
  }, [isSubmitting]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!productPickerRef.current?.contains(target)) {
        setIsProductMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsProductMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const handleDownloadQr = () => {
    const link = document.createElement('a');
    link.href = selectedQrSrc;
    link.download = selectedQrFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSelectProduct = (productName: string) => {
    setSelectedProductName(productName);
    setProductQuery(productName);
    setIsProductMenuOpen(false);
  };

  const handleAddSelectedProduct = () => {
    if (!selectedProduct) {
      setSubmitError('Select a product first before adding to the list.');
      return;
    }

    setSubmitError('');
    setSelectedProducts((prev) => {
      const alreadyAdded = prev.some((item) => item.name === selectedProduct.name && item.amount === selectedProduct.amount);
      if (alreadyAdded) {
        return prev;
      }

      return [...prev, selectedProduct];
    });
    setProductQuery('');
    setSelectedProductName('');
    setIsProductMenuOpen(false);
  };

  const removeSelectedProduct = (productName: string) => {
    setSelectedProducts((prev) => prev.filter((item) => item.name !== productName));
  };

  const handleSubmitVerification = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (selectedProducts.length === 0) {
      setSubmitError('Add at least one product before submitting.');
      return;
    }

    setSubmitError('');
    setSubmitResult(null);
    setSubmitProgress(10);
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/verification-submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username,
          email,
          products: selectedProducts,
          totalAmount,
          referenceNo,
        }),
      });

      const payload = (await response.json()) as VerificationApiResponse;
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? 'Unable to submit verification request.');
      }

      setSubmitProgress(100);
      setSubmitResult(payload);
      setUsername('');
      setEmail('');
      setReferenceNo('');
      setProductQuery('');
      setSelectedProductName('');
      setSelectedProducts([]);
    } catch (error) {
      setSubmitProgress(100);
      setSubmitError(error instanceof Error ? error.message : 'Unexpected error while submitting the form.');
    } finally {
      window.setTimeout(() => {
        setSubmitProgress(0);
      }, 500);
      setIsSubmitting(false);
    }
  };

  const stageItems: Array<{ id: FlowStage; code: string; title: string; mobileTitle: string }> = [
    { id: 1, code: '01', title: 'Order', mobileTitle: 'Order' },
    { id: 2, code: '02', title: 'Client Details', mobileTitle: 'Client' },
    { id: 3, code: '03', title: 'Payment Portal', mobileTitle: 'Portal' },
    { id: 4, code: '04', title: 'Confirmation', mobileTitle: 'Confirm' },
  ];

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-cyan-500/30 overflow-x-hidden">
      {/* Background Grid & Effects */}
      <div className="fixed inset-0 z-0 opacity-20 pointer-events-none" 
           style={{ backgroundImage: `linear-gradient(${COLORS.cyan}22 1px, transparent 1px), linear-gradient(90deg, ${COLORS.cyan}22 1px, transparent 1px)`, backgroundSize: '40px 40px' }} />
      <div className="fixed inset-0 z-0 bg-gradient-to-b from-transparent via-black/50 to-black pointer-events-none" />
      
      {/* Scanline Effect */}
      <div className="fixed inset-0 z-50 pointer-events-none opacity-[0.03] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%]" />

      <main className="relative z-10 max-w-4xl mx-auto px-4 py-8 sm:py-12">
        {/* Header */}
        <header className="text-center mb-10 sm:mb-16">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
          >
            <div className="inline-block border-2 border-cyan-500 px-5 py-3 sm:px-8 sm:py-4 mb-4 relative">
              <div className="absolute -top-1 -left-1 w-3 h-3 bg-cyan-500" />
              <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-cyan-500" />
              <h1 className="text-3xl sm:text-4xl md:text-6xl font-black tracking-tighter uppercase italic">
                <GlitchText text="DMERCH_PORTAL" />
              </h1>
            </div>
            <p className="text-cyan-400/80 font-mono text-[11px] sm:text-sm tracking-[0.25em] sm:tracking-[0.3em] uppercase">
              Secure Transaction Protocol v2.4.0
            </p>
          </motion.div>
        </header>

        <div className="mb-6 sm:mb-10 rounded-xl border border-cyan-500/30 bg-[#070a12]/70 p-3 sm:p-4 shadow-[0_0_20px_rgba(0,243,255,0.1)] sm:shadow-[0_0_30px_rgba(0,243,255,0.12)]">
          <div className="sm:hidden -mx-1 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex min-w-max gap-2 px-1 snap-x snap-mandatory">
              {stageItems.map((item) => {
                const isActive = stage === item.id;
                const isCompleted = item.id < stage;
                const isLocked = item.id > stage + 1;

                return (
                  <motion.button
                    key={`mobile-${item.id}`}
                    type="button"
                    whileHover={!isLocked ? { scale: 1.02 } : undefined}
                    whileTap={!isLocked ? { scale: 0.98 } : undefined}
                    onClick={() => !isLocked && handleSelectStage(item.id)}
                    disabled={isLocked}
                    className={`cyber-stage-chip cyber-stage-chip-mobile min-w-[112px] snap-start ${isActive ? 'cyber-stage-chip-active' : ''} ${isCompleted ? 'cyber-stage-chip-complete' : ''} ${isLocked ? 'cyber-stage-chip-locked' : ''}`}
                  >
                    <span className="flex items-center justify-between text-[9px] font-mono uppercase tracking-[0.2em] text-cyan-200/85">
                      <span>{item.code}</span>
                      {isLocked ? <Lock size={10} /> : isCompleted ? <Check size={10} /> : <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />}
                    </span>
                    <span className="mt-1 block text-[11px] font-semibold uppercase tracking-[0.1em] truncate">{item.mobileTitle}</span>
                  </motion.button>
                );
              })}
            </div>
          </div>

          <div className="hidden sm:grid grid-cols-2 md:grid-cols-4 gap-3">
            {stageItems.map((item) => {
              const isActive = stage === item.id;
              const isCompleted = item.id < stage;
              const isLocked = item.id > stage + 1;

              return (
                <motion.button
                  key={item.id}
                  type="button"
                  whileHover={!isLocked ? { scale: 1.03 } : undefined}
                  whileTap={!isLocked ? { scale: 0.97 } : undefined}
                  onClick={() => !isLocked && handleSelectStage(item.id)}
                  disabled={isLocked}
                  className={`cyber-stage-chip ${isActive ? 'cyber-stage-chip-active' : ''} ${isCompleted ? 'cyber-stage-chip-complete' : ''} ${isLocked ? 'cyber-stage-chip-locked' : ''}`}
                >
                  <span className="text-[10px] font-mono uppercase tracking-[0.3em]">{item.code}</span>
                  <span className="mt-1 block text-xs sm:text-sm font-semibold uppercase tracking-[0.12em]">{item.title}</span>
                  <span className="mt-2 inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-[0.2em]">
                    {isLocked ? <Lock size={11} /> : isCompleted ? <Check size={11} /> : <span className="h-2 w-2 rounded-full bg-current animate-pulse" />}
                    {isLocked ? 'Locked' : isCompleted ? 'Complete' : 'Active'}
                  </span>
                </motion.button>
              );
            })}
          </div>
        </div>

        <AnimatePresence mode="wait">
          {stage === 1 ? (
            <motion.div
              key="stage-1-order"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
            >
              <CyberCard title="Order Selection" icon={PackageSearch} color="magenta">
                <div ref={productPickerRef} className="relative z-10 rounded-xl border border-cyan-500/40 bg-[#0b111f]/80 p-4 shadow-[0_0_35px_rgba(0,195,255,0.1)]">
                  <div className="pointer-events-none absolute left-2 top-2 h-5 w-5 border-l-2 border-t-2 border-cyan-400/70" />
                  <div className="pointer-events-none absolute bottom-2 right-2 h-5 w-5 border-b-2 border-r-2 border-cyan-400/70" />
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[11px] font-mono uppercase tracking-[0.25em] text-cyan-300">Product Purchased</span>
                    <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-gray-400">Multi-Product Enabled</span>
                  </div>

                  <div className="relative">
                    <div className="relative">
                      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-cyan-300/70" />
                      <input
                        value={productQuery}
                        onChange={(event) => {
                          setProductQuery(event.target.value);
                          setSelectedProductName('');
                          setIsProductMenuOpen(true);
                        }}
                        onFocus={() => setIsProductMenuOpen(true)}
                        className="w-full rounded-md border border-cyan-500/50 bg-black/50 pl-10 pr-4 py-3 text-sm text-gray-100 outline-none transition focus:border-cyan-300 focus:shadow-[0_0_18px_rgba(0,255,255,0.2)]"
                        placeholder="Search product name"
                      />
                    </div>

                    {isProductMenuOpen && (
                      <div className="absolute z-30 mt-2 max-h-64 w-full overflow-auto rounded-md border border-cyan-500/40 bg-[#090d17] shadow-[0_0_28px_rgba(0,200,255,0.15)]">
                        {filteredProducts.length > 0 ? (
                          filteredProducts.map((product) => {
                            const isSelected = selectedProductName === product.name;
                            return (
                              <button
                                key={`${product.name}-${product.amount}`}
                                type="button"
                                onClick={() => handleSelectProduct(product.name)}
                                className={`flex w-full items-center justify-between border-b border-white/5 px-4 py-3 text-left transition last:border-b-0 ${isSelected ? 'bg-cyan-500/20 text-cyan-100' : 'text-gray-300 hover:bg-white/5'}`}
                              >
                                <span className="pr-3 text-xs sm:text-sm">{product.name}</span>
                                <span className="flex shrink-0 items-center gap-2 text-[11px] font-mono uppercase tracking-[0.2em]">
                                  PHP {product.amount}
                                  {isSelected ? <Check size={14} /> : null}
                                </span>
                              </button>
                            );
                          })
                        ) : (
                          <div className="px-4 py-4 text-xs font-mono uppercase tracking-[0.2em] text-gray-500">No matching product</div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="mt-3 flex flex-col sm:flex-row gap-3">
                    <motion.button
                      type="button"
                      whileHover={!selectedProduct ? undefined : { scale: 1.02 }}
                      whileTap={!selectedProduct ? undefined : { scale: 0.98 }}
                      onClick={handleAddSelectedProduct}
                      disabled={!selectedProduct}
                      className="cyber-btn cyber-btn-secondary"
                    >
                      <Plus size={14} />
                      Add Product
                    </motion.button>
                    <div className="rounded-md border border-cyan-500/40 bg-black/40 px-4 py-2 text-xs font-mono uppercase tracking-[0.2em] text-cyan-200">
                      {selectedProduct ? `Ready: PHP ${selectedProduct.amount}` : 'Select from list'}
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    {selectedProducts.length > 0 ? (
                      selectedProducts.map((item) => (
                        <div
                          key={`${item.name}-${item.amount}`}
                          className="flex items-start justify-between gap-3 rounded-md border border-cyan-500/30 bg-black/40 px-3 py-2"
                        >
                          <div>
                            <p className="text-sm text-cyan-100">{item.name}</p>
                            <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-cyan-300">PHP {item.amount}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeSelectedProduct(item.name)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded border border-red-400/40 text-red-300 hover:bg-red-500/10"
                            title="Remove product"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-md border border-dashed border-cyan-500/30 px-4 py-4 text-center text-xs font-mono uppercase tracking-[0.2em] text-gray-500">
                        No products added yet
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-3 rounded-md border border-cyan-500/30 bg-cyan-500/10 px-4 py-3">
                  <span className="text-xs font-mono uppercase tracking-[0.22em] text-cyan-200">
                    Products: {selectedProducts.length} | Total: PHP {totalAmount}
                  </span>
                  <motion.button type="button" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={goToNextStage} className="cyber-btn cyber-btn-primary">
                    Next: Client Details <ArrowRight size={15} />
                  </motion.button>
                </div>
              </CyberCard>
            </motion.div>
          ) : stage === 2 ? (
            <motion.div
              key="stage-2-client"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="w-full"
            >
              <CyberCard title="Client Details" icon={ShieldCheck} color="magenta">
                <div className="relative z-20 rounded-xl border border-cyan-500/40 bg-[#031018]/80 p-4 shadow-[0_0_35px_rgba(0,195,255,0.12)]">
                  <div className="pointer-events-none absolute left-2 top-2 h-5 w-5 border-l-2 border-t-2 border-cyan-400/70" />
                  <div className="pointer-events-none absolute bottom-2 right-2 h-5 w-5 border-b-2 border-r-2 border-cyan-400/70" />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label className="block">
                      <span className="mb-2 block text-[11px] font-mono uppercase tracking-[0.25em] text-cyan-300">Username</span>
                      <input
                        value={username}
                        onChange={(event) => setUsername(event.target.value)}
                        required
                        className="w-full rounded-md border border-cyan-500/50 bg-black/50 px-4 py-3 text-sm text-gray-100 outline-none transition focus:border-cyan-300 focus:shadow-[0_0_18px_rgba(0,255,255,0.2)]"
                        placeholder="Enter your username"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-[11px] font-mono uppercase tracking-[0.25em] text-cyan-300">Email</span>
                      <input
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        required
                        className="w-full rounded-md border border-cyan-500/50 bg-black/50 px-4 py-3 text-sm text-gray-100 outline-none transition focus:border-cyan-300 focus:shadow-[0_0_18px_rgba(0,255,255,0.2)]"
                        placeholder="buyer@email.com"
                      />
                    </label>
                  </div>
                </div>

                <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <motion.button type="button" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={goToPreviousStage} className="cyber-btn cyber-btn-secondary">
                    <ArrowLeft size={15} /> Back
                  </motion.button>
                  <motion.button type="button" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={goToNextStage} className="cyber-btn cyber-btn-primary">
                    Next: Payment Portal <ArrowRight size={15} />
                  </motion.button>
                </div>
              </CyberCard>
            </motion.div>
          ) : stage === 3 ? (
            <motion.div
              key="stage-3-portal"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
            >
              <div className="mb-6 sm:mb-10 space-y-4 sm:space-y-6">
                <div className="flex items-center justify-center gap-2 lg:hidden">
                  <button
                    type="button"
                    onClick={() => setSelectedMethod('gcash')}
                    className={`rounded-md border px-3 py-1.5 text-[10px] font-mono uppercase tracking-[0.18em] transition-colors ${selectedMethod === 'gcash' ? 'border-blue-400 bg-blue-500/15 text-blue-100' : 'border-white/20 text-gray-300'}`}
                  >
                    GCash
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedMethod('gotyme')}
                    className={`rounded-md border px-3 py-1.5 text-[10px] font-mono uppercase tracking-[0.18em] transition-colors ${selectedMethod === 'gotyme' ? 'border-cyan-300 bg-cyan-400/15 text-cyan-100' : 'border-white/20 text-gray-300'}`}
                  >
                    GoTyme
                  </button>
                </div>

                <div className="flex flex-col lg:flex-row items-center justify-center gap-4 sm:gap-8 lg:gap-12">
                  <div className="hidden lg:block">
                    <MethodCard method="gcash" id="001" selectedMethod={selectedMethod} onSelectMethod={setSelectedMethod} />
                  </div>

                  <div className="w-full max-w-sm">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={selectedMethod}
                        initial={{ opacity: 0, scale: 0.9, rotateY: 90 }}
                        animate={{ opacity: 1, scale: 1, rotateY: 0 }}
                        exit={{ opacity: 0, scale: 0.9, rotateY: -90 }}
                        transition={{ duration: 0.5, type: 'spring', stiffness: 100 }}
                        className="relative"
                      >
                        <div className="relative group">
                          <div className={`absolute -inset-2 bg-gradient-to-r ${selectedMethod === 'gcash' ? 'from-blue-500 to-cyan-500' : 'from-cyan-400 to-emerald-400'} rounded-lg blur opacity-40 group-hover:opacity-60 transition duration-1000`} />
                          <div className="relative bg-[#0a0a0a] rounded-lg p-3 sm:p-6 border border-white/10 flex flex-col items-center shadow-2xl">
                            <div className={`w-full ${selectedMethod === 'gcash' ? 'bg-[#007dfe]' : 'bg-[#00e5ff]'} py-2 sm:py-3 px-3 sm:px-6 rounded-t-md flex justify-between items-center shadow-lg`}>
                              <span className={`font-black italic tracking-tighter uppercase text-[11px] sm:text-sm ${selectedMethod === 'gcash' ? 'text-white' : 'text-black'}`}>
                                {selectedMethod === 'gcash' ? 'GCash Terminal' : 'GoTyme Terminal'}
                              </span>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={handleDownloadQr}
                                  className={`inline-flex h-7 w-7 items-center justify-center rounded-full border transition-colors ${selectedMethod === 'gcash' ? 'border-white/60 text-white hover:bg-white/15' : 'border-black/60 text-black hover:bg-black/15'}`}
                                  title="Download QR"
                                  aria-label="Download QR"
                                >
                                  <Download size={14} />
                                </button>
                                <div className={`w-3 h-3 rounded-full ${selectedMethod === 'gcash' ? 'bg-white' : 'bg-black'} animate-pulse`} />
                              </div>
                            </div>

                            <div className={`${selectedMethod === 'gcash' ? 'bg-[#007dfe]' : 'bg-[#00e5ff]'} p-2 sm:p-4 w-full aspect-[3/4] sm:aspect-[3/5] flex items-center justify-center overflow-hidden border-x-4 border-b-4 ${selectedMethod === 'gcash' ? 'border-blue-600' : 'border-cyan-500'}`}>
                              <img
                                src={selectedQrSrc}
                                alt={`${selectedMethod === 'gcash' ? 'GCash' : 'GoTyme'} payment QR code`}
                                className="w-full h-full object-contain"
                                referrerPolicy="no-referrer"
                              />
                            </div>

                            <div className="mt-3 sm:mt-6 text-center w-full py-3 sm:py-4 border-t border-white/5">
                              <button
                                type="button"
                                onClick={handleDownloadQr}
                                className="mb-3 inline-flex items-center gap-2 rounded border border-white/20 px-3 py-1.5 text-[10px] font-mono uppercase tracking-[0.2em] text-gray-300 hover:text-white hover:border-white/40 transition-colors"
                              >
                                <Download size={12} />
                                Download QR
                              </button>
                              <p className="text-[10px] font-mono text-gray-500 uppercase tracking-[0.3em] mb-1">Recipient Verified</p>
                              <p className="text-xl font-black text-white tracking-widest uppercase italic bg-gradient-to-r from-white to-gray-500 bg-clip-text text-transparent">
                                Robert Rich Garcia
                              </p>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    </AnimatePresence>
                  </div>

                  <div className="hidden lg:block">
                    <MethodCard method="gotyme" id="002" selectedMethod={selectedMethod} onSelectMethod={setSelectedMethod} />
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row justify-center gap-3">
                <motion.button type="button" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={goToPreviousStage} className="cyber-btn cyber-btn-secondary">
                  <ArrowLeft size={15} /> Back
                </motion.button>
                <motion.button type="button" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={goToNextStage} className="cyber-btn cyber-btn-primary">
                  Next: Confirmation <ArrowRight size={15} />
                </motion.button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="stage-4-confirmation"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="w-full"
            >
              <CyberCard title="Confirmation & Verification" icon={ShieldCheck} color="magenta">
                <div className="mb-4 rounded-xl border border-cyan-500/40 bg-[#031018]/80 p-4 shadow-[0_0_30px_rgba(0,195,255,0.1)]">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-cyan-300">Products</p>
                      <p className="mt-1 text-sm text-white">{selectedProducts.length} item(s)</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-cyan-300">Portal</p>
                      <p className="mt-1 text-sm text-white uppercase">{selectedMethod === 'gcash' ? 'GCash' : 'GoTyme'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-cyan-300">Total</p>
                      <p className="mt-1 text-sm text-white">PHP {totalAmount}</p>
                    </div>
                  </div>
                </div>

                <form onSubmit={handleSubmitVerification} className="space-y-6">
                  <div className="relative z-10 rounded-xl border border-[#ff8a00]/40 bg-[#1a0e05] p-4 shadow-[0_0_35px_rgba(255,128,0,0.2)]">
                    <div className="pointer-events-none absolute left-2 top-2 h-5 w-5 border-l-2 border-t-2 border-[#ff9f1a]/80" />
                    <div className="pointer-events-none absolute bottom-2 right-2 h-5 w-5 border-b-2 border-r-2 border-[#ff9f1a]/80" />
                    <div className="mb-3 flex items-center gap-2 text-[#ffb257]">
                      <PackageSearch size={15} />
                      <span className="text-[11px] font-mono uppercase tracking-[0.25em]">Verification Summary</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <label className="block">
                        <span className="mb-2 block text-[11px] font-mono uppercase tracking-[0.25em] text-[#ffb257]">Reference No</span>
                        <input
                          value={referenceNo}
                          onChange={(event) => setReferenceNo(event.target.value)}
                          required
                          className="w-full rounded-md border border-[#ff8a00]/50 bg-black/40 px-4 py-3 text-sm text-gray-100 outline-none transition focus:border-[#ffb257] focus:shadow-[0_0_18px_rgba(255,138,0,0.24)]"
                          placeholder="Enter payment reference"
                        />
                      </label>
                      <div>
                        <span className="mb-2 block text-[11px] font-mono uppercase tracking-[0.25em] text-[#ffb257]">Total Amount</span>
                        <div className="rounded-md border border-[#ff8a00]/50 bg-black/30 px-4 py-3 text-sm font-mono uppercase tracking-[0.15em] text-[#ffc680]">
                          PHP {totalAmount}
                        </div>
                      </div>
                    </div>

                    {isSubmitting ? (
                      <div className="mt-4 rounded-md border border-[#ff8a00]/60 bg-black/50 p-3">
                        <p className="mb-2 text-xs font-mono uppercase tracking-[0.25em] text-[#ffb257]">Processing Transmission...</p>
                        <div className="h-3 w-full overflow-hidden rounded-sm border border-[#ff8a00]/70 bg-[#2b1608]">
                          <motion.div
                            initial={{ width: '0%' }}
                            animate={{ width: `${submitProgress}%` }}
                            transition={{ duration: 0.25, ease: 'easeOut' }}
                            className="h-full bg-[repeating-linear-gradient(-45deg,#9dff4f,#9dff4f_10px,#53bf1e_10px,#53bf1e_20px)] shadow-[0_0_18px_rgba(157,255,79,0.6)]"
                          />
                        </div>
                        <p className="mt-2 text-right text-xs font-mono uppercase tracking-[0.2em] text-[#ffb257]">{submitProgress}%</p>
                      </div>
                    ) : null}
                  </div>

                  {submitError ? (
                    <div className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs font-mono uppercase tracking-[0.15em] text-red-300">
                      {submitError}
                    </div>
                  ) : null}

                  {submitResult?.ok ? (
                    <div className="rounded-md border border-cyan-500/40 bg-cyan-500/10 px-4 py-4">
                      <p className="mb-2 text-xs font-mono uppercase tracking-[0.2em] text-cyan-300">Verification Submitted</p>
                      <p className="text-lg font-black tracking-wider text-white">{submitResult.serialNo}</p>
                      <p className="mt-2 text-xs text-gray-300">
                        Sequence: {submitResult.sequenceNo} | Total: PHP {submitResult.totalAmount ?? totalAmount} | Email status: {submitResult.emailStatus}
                      </p>
                    </div>
                  ) : null}

                  <div className="flex flex-col sm:flex-row gap-3 justify-between">
                    <motion.button type="button" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={goToPreviousStage} className="cyber-btn cyber-btn-secondary">
                      <ArrowLeft size={15} /> Back
                    </motion.button>

                    <motion.button
                      type="submit"
                      whileHover={isSubmitting || selectedProducts.length === 0 ? undefined : { scale: 1.02 }}
                      whileTap={isSubmitting || selectedProducts.length === 0 ? undefined : { scale: 0.98 }}
                      disabled={isSubmitting || selectedProducts.length === 0}
                      className="cyber-btn cyber-btn-primary"
                    >
                      {isSubmitting ? 'Sending Verification...' : 'Submit Verification'}
                      {!isSubmitting ? <ArrowRight size={15} /> : null}
                    </motion.button>
                  </div>
                </form>
              </CyberCard>

              <div className="mt-8 flex justify-between items-center">
                <button
                  onClick={goToPreviousStage}
                  className="text-gray-500 hover:text-cyan-400 font-mono text-xs uppercase tracking-widest flex items-center gap-2 transition-colors"
                >
                  ← Back to Payment Portal
                </button>
                <div className="flex items-center gap-2 text-magenta-400/60 font-mono text-[10px] uppercase">
                  <ShieldCheck size={14} />
                  End-to-End Encrypted Verification
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer Info */}
        <footer className="mt-12 sm:mt-24 pt-6 sm:pt-8 border-t border-white/5 text-center hidden sm:block">
          {/* Social Links */}
          <div className="flex justify-center gap-10 mb-10">
            <motion.a
              whileHover={{ scale: 1.15, color: '#1877F2' }}
              href="https://www.facebook.com/digitalmerch4862/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-300 transition-colors"
              title="Facebook"
            >
              <Facebook size={34} />
            </motion.a>
            <motion.a
              whileHover={{ scale: 1.15, color: '#FF0000' }}
              href="https://youtube.com/@digitalmerch-sy7yt?si=c8VCo5afd47Rf5Df"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-300 transition-colors"
              title="YouTube"
            >
              <Youtube size={34} />
            </motion.a>
            <motion.a
              whileHover={{ scale: 1.15, color: '#E4405F' }}
              href="https://www.instagram.com/digitalmerch4862/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-300 transition-colors"
              title="Instagram"
            >
              <Instagram size={34} />
            </motion.a>
          </div>
          <p className="text-gray-600 text-[10px] font-mono uppercase tracking-widest">
            © 2026 DMERCH PROTOCOL // ALL RIGHTS RESERVED // SYSTEM STATUS: OPTIMAL
          </p>
        </footer>
      </main>
    </div>
  );
}
