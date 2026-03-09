/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { type ComponentType, type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldCheck, Facebook, Youtube, Instagram, Download, Search, Check, Plus, X, PackageSearch, ArrowRight, ArrowLeft, Home, ShoppingCart, Mail, Cpu, Gamepad2, PlayCircle, Book, Palette, Layers, BookOpen, ChevronDown, ChevronRight as ChevronRightIcon, ChevronsRight, ChevronsLeft, GraduationCap, Eye, Clock, Users, FileText, Star, LogOut, QrCode, ShieldAlert, AlertCircle } from 'lucide-react';
import { productCatalog, type ProductItem } from './data/products';
import { getSupabaseBrowserClient } from './lib/supabase-browser';
import { supabase } from './supabaseClient.js';
import gcashQr from './gcash-qr.png';

const ADMIN_PRODUCTS_KEY = 'dmerch_admin_products_v1';
const ADMIN_GOOGLE_SHORTCUT_KEY = 'dmerch_admin_google_shortcut_v1';
const CHECKOUT_DRAFT_KEY = 'dmerch_checkout_draft_v1';
const STAGE_LOCK_KEY = 'dmerch_stage_locked_v1';
const ALLOWED_ADMIN_EMAILS = new Set(['digitalmerch4862@gmail.com']);
const PAYMONGO_STATIC_QR = gcashQr;

const isAllowedAdminEmail = (value: string | null | undefined) => {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized.length > 0 && ALLOWED_ADMIN_EMAILS.has(normalized);
};

const extractGoogleName = (rawMetadata: unknown) => {
  const metadata = rawMetadata && typeof rawMetadata === 'object' ? (rawMetadata as Record<string, unknown>) : {};
  const candidates = [metadata.full_name, metadata.name, metadata.preferred_username];
  for (const candidate of candidates) {
    const value = String(candidate ?? '').trim();
    if (value) {
      return value;
    }
  }
  return '';
};

const resolveAuthRedirectBaseUrl = () => {
  return window.location.origin.replace(/\/+$/, '');
};

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
  customerEmailStatus?: string;
  adminEmailStatus?: string;
  customerEmailDelivered?: boolean;
  totalAmount?: number;
  notice?: string;
  error?: string;
};

type DeliveryProduct = {
  name: string;
  amount: number;
  os?: string;
  status?: 'approved' | 'rejected';
};

type CheckoutDraft = {
  username: string;
  email: string;
  referenceNo: string;
  selectedMethod: 'paymongo';
  paymentPortalUsed: 'paymongo';
  paymongoReference: string;
  selectedProducts: ProductItem[];
};



type FakeAvailment = {
  buyer: string;
  location: string;
  product: string;
  timeLabel: string;
};

const FAKE_AVAILMENTS: FakeAvailment[] = [
  { buyer: 'R***', location: 'New York City', product: 'Adobe Photoshop 2025', timeLabel: 'just now' },
  { buyer: 'M***', location: 'London', product: 'CANVA PREMIUM LIFE TIME', timeLabel: '9s ago' },
  { buyer: 'J***', location: 'Singapore', product: 'Microsoft Office Professional Plus 2024', timeLabel: '21s ago' },
  { buyer: 'A***', location: 'Sydney', product: 'Adobe Premiere Pro 2025', timeLabel: '34s ago' },
  { buyer: 'K***', location: 'Dubai', product: 'Autodesk AutoCAD 2024', timeLabel: '48s ago' },
  { buyer: 'P***', location: 'Berlin', product: 'Wondershare Filmora 13', timeLabel: '1m ago' },
  { buyer: 'S***', location: 'Tokyo', product: 'GO HIGH LEVEL SUB ACCOUNT MONTHLY', timeLabel: '1m ago' },
  { buyer: 'D***', location: 'San Francisco', product: 'Adobe Illustrator 2025', timeLabel: '2m ago' },
];

type FlowStage = 1 | 2 | 3 | 4;

function GlitchText({ text, className = '' }: { text: string; className?: string }) {
  return (
    <div className={`relative inline-block ${className}`}>
      <span className="relative z-10">{text}</span>
      <span className="absolute top-0 left-0 -ml-0.5 text-cyan-400 opacity-70 animate-pulse select-none z-0" style={{ clipPath: 'inset(45% 0 30% 0)' }}>{text}</span>
      <span className="absolute top-0 left-0 ml-0.5 text-magenta-400 opacity-70 animate-pulse select-none z-0" style={{ clipPath: 'inset(10% 0 60% 0)' }}>{text}</span>
    </div>
  );
}

const getCategoryIcon = (category: string) => {
  const cat = (category || '').toLowerCase();
  if (cat.includes('software')) return Cpu;
  if (cat.includes('game')) return Gamepad2;
  if (cat.includes('course')) return GraduationCap;
  if (cat.includes('ebook') || cat.includes('book')) return BookOpen;
  if (cat.includes('design') || cat.includes('graphic')) return Palette;
  if (cat.includes('engineering')) return Layers;
  return PackageSearch;
};

function ProductListItem({ product, onAdd }: { key?: string | number; product: ProductItem; onAdd: (product: ProductItem) => void }) {
  const [added, setAdded] = useState(false);

  const handleAdd = () => {
    onAdd(product);
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  };

  return (
    <div className="flex items-center justify-between gap-2 border-b border-cyan-500/10 px-3 py-2.5 hover:bg-cyan-500/5 transition-colors last:border-b-0">
      <p className="text-xs sm:text-sm text-gray-200 flex-1 min-w-0 truncate">{product.name}</p>
      <span className="flex-shrink-0 text-[10px] font-mono uppercase tracking-[0.15em] text-cyan-300">PHP {product.amount}</span>
      <button
        type="button"
        onClick={handleAdd}
        className={`flex-shrink-0 px-3 py-1.5 rounded border text-[9px] font-bold uppercase tracking-[0.15em] transition-all duration-300 ${added
          ? 'bg-green-500 border-green-400 text-black shadow-[0_0_10px_rgba(34,197,94,0.4)]'
          : 'bg-cyan-500/10 border-cyan-500/40 text-cyan-300 hover:bg-cyan-500 hover:text-black hover:border-cyan-400'
          }`}
      >
        {added ? <span className="flex items-center gap-1"><Check size={10} /> Added</span> : '+ Add'}
      </button>
    </div>
  );
}

function CyberCard({ children, title, icon: Icon, color = 'cyan' }: { children: ReactNode; title: string; icon: ComponentType<{ className?: string; size?: number }>; color?: 'cyan' | 'magenta' }) {
  void title;
  void Icon;
  const isMagenta = color === 'magenta';
  const borderColor = color === 'cyan' ? 'border-[#00f3ff]' : 'border-[#ff00ff]';
  const shadowColor = color === 'cyan' ? 'shadow-[0_0_15px_rgba(0,243,255,0.3)]' : 'shadow-[0_0_15px_rgba(255,0,255,0.3)]';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative cyber-saber-frame ${isMagenta ? 'cyber-saber-frame-magenta' : 'cyber-saber-frame-cyan'} bg-black/80 p-4 sm:p-6 mb-4 sm:mb-6 ${shadowColor} backdrop-blur-md overflow-hidden ${isMagenta ? 'cyber-magenta-card border border-magenta-500/40' : `border-l-4 ${borderColor}`}`}
    >
      <div className="relative z-10 text-gray-300">{children}</div>
      <div className={`absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 ${borderColor} opacity-50`} />
      <div className={`absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 ${borderColor} opacity-50`} />
    </motion.div>
  );
}

export default function App() {
  const [stage, setStage] = useState<FlowStage>(1);
  const [paymentPortalUsed, setPaymentPortalUsed] = useState<'paymongo'>('paymongo');
  const [paymongoReference, setPaymongoReference] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [referenceNo, setReferenceNo] = useState('');
  const [productQuery, setProductQuery] = useState('');
  const [selectedProductName, setSelectedProductName] = useState('');
  const [selectedProducts, setSelectedProducts] = useState<ProductItem[]>([]);
  const [availableProducts, setAvailableProducts] = useState<ProductItem[]>([]);
  const [isProductMenuOpen, setIsProductMenuOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitProgress, setSubmitProgress] = useState(0);
  const [submitError, setSubmitError] = useState('');
  const [submitNotice, setSubmitNotice] = useState('');
  const [adminShortcutError, setAdminShortcutError] = useState('');
  const [submitResult, setSubmitResult] = useState<VerificationApiResponse | null>(null);
  const [lastSubmittedProducts, setLastSubmittedProducts] = useState<ProductItem[]>([]);
  const [liveAvailmentIndex, setLiveAvailmentIndex] = useState(0);
  const [isStageLocked, setIsStageLocked] = useState(false);
  const [deliveryProducts, setDeliveryProducts] = useState<DeliveryProduct[]>([]);
  const [deliveryToken, setDeliveryToken] = useState('');
  const [deliveryStatus, setDeliveryStatus] = useState('');
  const [deliveryError, setDeliveryError] = useState('');
  const [deliveryLoading, setDeliveryLoading] = useState(false);
  const [downloadingDeliveryProduct, setDownloadingDeliveryProduct] = useState('');
  const [paymentIntentId, setPaymentIntentId] = useState('');
  const [paymongoQrUrl, setPaymongoQrUrl] = useState('');
  const [isCreatingPayment, setIsCreatingPayment] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'paid' | 'failed' | 'awaiting_payment'>('pending');
  const [paymongoQrError, setPaymongoQrError] = useState(false);
  const [paymentPaidBanner, setPaymentPaidBanner] = useState(false);
  const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({});
  const [expandedSubs, setExpandedSubs] = useState<Record<string, boolean>>({});
  const [showCourses, setShowCourses] = useState(false);
  const [previewCourse, setPreviewCourse] = useState<ProductItem | null>(null);
  const [paymentTimer, setPaymentTimer] = useState(60);
  const productPickerRef = useRef<HTMLDivElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const uploadSfxIntervalRef = useRef<number | null>(null);
  const uploadSfxStepRef = useRef(0);
  const sfxEnabled = true;

  const paymongoQrSrc = (paymongoQrUrl && paymongoQrUrl.trim().length > 0 && !paymongoQrError) ? paymongoQrUrl.trim() : PAYMONGO_STATIC_QR;
  const canDownloadPaymongoQr = !!(paymongoQrSrc && paymongoQrSrc.length > 5);
  const paymongoQrFilename = 'gcash-qr.png';
  const activeAvailment = FAKE_AVAILMENTS[liveAvailmentIndex % FAKE_AVAILMENTS.length];

  useEffect(() => {
    const logVisit = async () => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;

      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;

      const page = window.location.pathname;
      const userAgent = window.navigator.userAgent;

      const sessionId = window.sessionStorage.getItem('dmerch_session_id') || crypto.randomUUID();
      window.sessionStorage.setItem('dmerch_session_id', sessionId);

      await supabase.from('analytics_visits').insert({
        page,
        user_agent: userAgent,
        username: user?.user_metadata?.full_name || user?.email || 'Anonymous',
        user_id: user?.id || null,
        session_id: sessionId,
      });
    };

    const fetchSupabaseProducts = async () => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;

      const { data, error } = await supabase
        .from('products')
        .select('name, price, category, sub_category, file_url')
        .order('name');

      if (!error && data) {
        setAvailableProducts(data.map(p => ({
          name: String(p.name ?? '').trim(),
          amount: Number(p.price || 0),
          category: p.category || undefined,
          sub_category: p.sub_category || undefined,
          fileLink: p.file_url || undefined,
        })));
      }
    };

    void logVisit();
    void fetchSupabaseProducts();

    const supabase = getSupabaseBrowserClient();
    const realtimeChannel = supabase
      ? supabase
        .channel('products-stage2')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
          void fetchSupabaseProducts();
        })
        .subscribe()
      : null;

    // Still listen for storage sync for compatibility
    const handleStorageSync = (event: StorageEvent) => {
      if (event.key !== ADMIN_PRODUCTS_KEY) return;
      // If we got a local update, we might still want to respect it
      try {
        const parsed = JSON.parse(event.newValue || '[]');
        if (Array.isArray(parsed) && parsed.length > 0) {
          setAvailableProducts(parsed.map((item: any) => ({
            name: String(item?.name ?? '').trim(),
            amount: Number(item?.amount ?? 0),
          })).filter(i => i.name));
        }
      } catch { /* ignore */ }
    };

    window.addEventListener('storage', handleStorageSync);
    return () => {
      window.removeEventListener('storage', handleStorageSync);
      if (realtimeChannel && supabase) {
        void supabase.removeChannel(realtimeChannel);
      }
    };
  }, []);

  useEffect(() => {
    const storedLock = window.localStorage.getItem(STAGE_LOCK_KEY);
    if (storedLock === '1') {
      setIsStageLocked(true);
      setStage(2);
    }
  }, []);

  useEffect(() => {
    const rawDraft = window.localStorage.getItem(CHECKOUT_DRAFT_KEY);
    if (!rawDraft) {
      return;
    }

    try {
      const parsed = JSON.parse(rawDraft) as Partial<CheckoutDraft>;
      const products = Array.isArray(parsed.selectedProducts)
        ? parsed.selectedProducts
          .map((item) => ({
            name: String((item as ProductItem)?.name ?? '').trim(),
            amount: Number((item as ProductItem)?.amount ?? 0),
          }))
          .filter((item) => item.name && Number.isFinite(item.amount) && item.amount > 0)
        : [];

      if (products.length > 0) {
        setSelectedProducts(products);
      }

      setPaymentPortalUsed('paymongo');
      setUsername(String(parsed.username ?? '').trim());
      setEmail(String(parsed.email ?? '').trim());
      setReferenceNo(String(parsed.referenceNo ?? '').trim());
      const legacyReference = String((parsed as { gcashNumberUsed?: string }).gcashNumberUsed ?? '').trim();
      const legacyName = String((parsed as { gotymeAccountNameUsed?: string }).gotymeAccountNameUsed ?? '').trim();
      setPaymongoReference(String((parsed as { paymongoReference?: string }).paymongoReference ?? legacyReference ?? legacyName).trim());
    } catch {
      window.localStorage.removeItem(CHECKOUT_DRAFT_KEY);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const evaluateSession = async (session: { user?: { email?: string | null; user_metadata?: unknown } } | null | undefined) => {
      if (!mounted) {
        return;
      }

      const shouldHandleShortcut = window.localStorage.getItem(ADMIN_GOOGLE_SHORTCUT_KEY) === '1';
      const emailValue = session?.user?.email;
      if (!emailValue) {
        return;
      }

      const normalizedEmail = String(emailValue).trim().toLowerCase();
      setEmail(normalizedEmail);
      setUsername((current) => {
        if ((current ?? '').trim()) {
          return current;
        }
        const suggestedName = extractGoogleName(session?.user?.user_metadata);
        if (suggestedName) {
          return suggestedName;
        }
        return normalizedEmail.split('@')[0] ?? '';
      });

      if (isAllowedAdminEmail(emailValue)) {
        window.localStorage.removeItem(CHECKOUT_DRAFT_KEY);
        window.localStorage.removeItem(ADMIN_GOOGLE_SHORTCUT_KEY);
        window.location.href = '/admin';
        return;
      }

      if (shouldHandleShortcut) {
        window.localStorage.removeItem(ADMIN_GOOGLE_SHORTCUT_KEY);
        await supabase.auth.signOut();
        if (!mounted) {
          return;
        }
        setAdminShortcutError('Google sign-in complete. Email auto-filled. Continue checkout.');
        window.localStorage.setItem(STAGE_LOCK_KEY, '1');
        setIsStageLocked(true);
        setStage(2);
      }
    };

    void supabase.auth.getSession().then(({ data }) => {
      void evaluateSession(data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      void evaluateSession(session);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const handleAdminGoogleShortcut = async () => {
    setAdminShortcutError('');
    const draft: CheckoutDraft = {
      username: (username ?? '').trim(),
      email: (email ?? '').trim(),
      referenceNo: (referenceNo ?? '').trim(),
      selectedMethod: 'paymongo',
      paymentPortalUsed: 'paymongo',
      paymongoReference: (paymongoReference ?? '').trim(),
      selectedProducts,
    };
    window.localStorage.setItem(CHECKOUT_DRAFT_KEY, JSON.stringify(draft));
    window.localStorage.setItem(ADMIN_GOOGLE_SHORTCUT_KEY, '1');
    const redirectBaseUrl = resolveAuthRedirectBaseUrl();
    const returnPath = `${window.location.pathname}${window.location.search}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${redirectBaseUrl}${returnPath}`,
      },
    });

    if (error) {
      window.localStorage.removeItem(ADMIN_GOOGLE_SHORTCUT_KEY);
      setAdminShortcutError(error.message);
    }
  };

  const playTapSfx = useCallback((strength: 'soft' | 'strong' = 'soft') => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) {
        return;
      }

      if (!audioContextRef.current) {
        audioContextRef.current = new AudioCtx();
      }

      const context = audioContextRef.current;
      if (context.state === 'suspended') {
        context.resume().catch(() => undefined);
      }

      const now = context.currentTime;
      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.type = 'sawtooth';
      const startFrequency = strength === 'strong' ? 1880 : 1420;
      const endFrequency = strength === 'strong' ? 180 : 130;
      const duration = strength === 'strong' ? 0.14 : 0.11;

      oscillator.frequency.setValueAtTime(startFrequency, now);
      oscillator.frequency.exponentialRampToValueAtTime(endFrequency, now + duration);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(strength === 'strong' ? 0.045 : 0.03, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now);
      oscillator.stop(now + duration + 0.01);
    } catch {
      // SFX should fail silently in unsupported browsers
    }
  }, []);

  const playUploadSfx = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) {
        return;
      }

      if (!audioContextRef.current) {
        audioContextRef.current = new AudioCtx();
      }

      const context = audioContextRef.current;
      if (context.state === 'suspended') {
        context.resume().catch(() => undefined);
      }

      const now = context.currentTime;
      const frequencies = [1450, 1180, 1560, 1280];
      const step = uploadSfxStepRef.current % frequencies.length;
      uploadSfxStepRef.current += 1;
      const startFreq = frequencies[step];

      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.type = 'square';
      oscillator.frequency.setValueAtTime(startFreq, now);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(540, startFreq * 0.55), now + 0.12);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.03, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);

      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.14);
    } catch {
      // Upload SFX should fail silently in unsupported browsers
    }
  }, []);

  const filteredProducts = useMemo(() => {
    const query = (productQuery ?? '').trim().toLowerCase();
    if (!query) {
      return availableProducts;
    }

    const tokens = query.split(/\s+/).filter(Boolean);

    return availableProducts
      .map((item) => {
        const name = (item.name ?? '').toLowerCase();
        const cat = (item.category || '').toLowerCase();
        const sub = (item.sub_category || '').toLowerCase();
        const searchTarget = `${name} ${cat} ${sub}`;
        let score = 0;

        if (name === query || cat === query) {
          score += 100;
        } else if (name.startsWith(query) || cat.startsWith(query)) {
          score += 50;
        } else if (tokens.length > 1 && tokens.every((token) => searchTarget.includes(token))) {
          score += 25;
        } else if (tokens.every((token) => searchTarget.includes(token))) {
          score += 15;
        } else if (tokens.some((token) => searchTarget.includes(token))) {
          score += 10;
        }

        return { ...item, _score: score };
      })
      .filter((item) => item._score > 0)
      .sort((a, b) => b._score - a._score)
      .map(({ _score, ...item }) => item);
  }, [availableProducts, productQuery]);

  const categorizedProducts = useMemo(() => {
    const raw: Record<string, Record<string, ProductItem[]>> = {};

    filteredProducts.forEach((product) => {
      const cat = product.category || 'Software';
      const sub = product.sub_category || 'General';

      if (!raw[cat]) {
        raw[cat] = {};
      }
      if (!raw[cat][sub]) {
        raw[cat][sub] = [];
      }
      raw[cat][sub].push(product);
    });

    // Sort categories alphabetically
    const sortedCats = Object.keys(raw).sort((a, b) => a.localeCompare(b));
    const sorted: Record<string, Record<string, ProductItem[]>> = {};

    for (const cat of sortedCats) {
      const subs = raw[cat];
      // Sort sub-categories: General first, Others last, rest alphabetical
      const sortedSubKeys = Object.keys(subs).sort((a, b) => {
        const aLower = a.toLowerCase();
        const bLower = b.toLowerCase();
        if (aLower === 'general') return -1;
        if (bLower === 'general') return 1;
        if (aLower === 'others') return 1;
        if (bLower === 'others') return -1;
        return a.localeCompare(b);
      });
      sorted[cat] = {};
      for (const sub of sortedSubKeys) {
        sorted[cat][sub] = subs[sub];
      }
    }

    return sorted;
  }, [filteredProducts]);

  const { softwareProducts, coursesProducts, hasCourses, courseCount } = useMemo(() => {
    const raw = categorizedProducts as Record<string, Record<string, ProductItem[]>>;
    const courses = raw['Courses'] || {};
    const has = Object.keys(courses).length > 0;
    const count = Object.values(courses).flat().length;
    const software = { ...raw };
    delete software['Courses'];
    return {
      softwareProducts: software,
      coursesProducts: courses,
      hasCourses: has,
      courseCount: count
    };
  }, [categorizedProducts]);

  const addProductToCart = (product: ProductItem) => {
    setSubmitError('');
    setSelectedProducts((prev) => {
      const alreadyAdded = prev.some((item) => item.name === product.name && item.amount === product.amount);
      if (alreadyAdded) {
        return prev;
      }
      return [...prev, product];
    });
  };

  const selectedProduct = useMemo(() => {
    if (!selectedProductName) {
      return null;
    }

    return availableProducts.find((item) => item.name === selectedProductName) ?? null;
  }, [availableProducts, selectedProductName]);

  const totalAmount = useMemo(() => {
    return selectedProducts.reduce((sum, item) => sum + item.amount, 0);
  }, [selectedProducts]);

  const orderSummaryItems = useMemo(() => {
    const source = selectedProducts.length > 0 ? selectedProducts : lastSubmittedProducts;
    return source.map((item) => {
      return {
        ...item,
        category: item.category || 'Software',
      };
    });
  }, [lastSubmittedProducts, selectedProducts]);

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const isEmailValid = emailPattern.test((email ?? '').trim());

  const canProceedFrom = (fromStage: FlowStage) => {
    return true; // Bypass all guards as per user request
  };

  const stageErrorMessage: Record<FlowStage, string> = {
    1: '',
    2: '',
    3: '',
    4: '',
  };

  const goToNextStage = async () => {
    if (stage === 4) {
      return;
    }

    if (!canProceedFrom(stage)) {
      setSubmitError(stageErrorMessage[stage]);
      return;
    }

    setSubmitError('');

    if (stage === 2) {
      setIsCreatingPayment(true);
      try {
        const response = await fetch('/api/paymongo-create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: totalAmount,
            email: (email ?? '').trim(),
            username: (username ?? '').trim(),
            items: selectedProducts,
          }),
        });
        const payload = await response.json();

        // If API fails, we still allow proceeding to Stage 3 for manual payment
        if (payload.ok) {
          setPaymentIntentId(payload.intentId);
          setPaymongoQrUrl(payload.qrUrl);
          setPaymongoQrError(false);
          setPaymentTimer(60); // Reset timer for new QR
        } else {
          console.warn('[Checkout] PayMongo API error, falling back to manual mode:', payload.error);
          setPaymongoQrUrl(''); // Trigger fallback to static QR
          setPaymentIntentId('');
        }
        setStage(3);
      } catch (err: any) {
        console.warn('[Checkout] Network error, falling back to manual mode:', err.message);
        setPaymongoQrUrl('');
        setPaymentIntentId('');
        setStage(3);
      } finally {
        setIsCreatingPayment(false);
      }
      return;
    }

    if (stage === 3) {
      setPaymentPortalUsed('paymongo');
    }
    if (stage === 1) {
      window.localStorage.setItem(STAGE_LOCK_KEY, '1');
      setIsStageLocked(true);
    }
    setStage((current) => (current < 4 ? ((current + 1) as FlowStage) : current));
  };

  const goToPreviousStage = () => {
    setSubmitError('');
    if (stage === 2 && isStageLocked) {
      return;
    }
    setStage((current) => (current > 1 ? ((current - 1) as FlowStage) : current));
  };

  const handleClientSignOut = async () => {
    const client = getSupabaseBrowserClient();
    if (client) {
      await client.auth.signOut();
    }
    window.localStorage.removeItem(STAGE_LOCK_KEY);
    window.localStorage.removeItem(CHECKOUT_DRAFT_KEY);
    setIsStageLocked(false);
    setStage(1);
    setUsername('');
    setEmail('');
    setReferenceNo('');
    setSelectedProducts([]);
    setLastSubmittedProducts([]);
    setProductQuery('');
    setSelectedProductName('');
    setPaymentPortalUsed('paymongo');
    setPaymongoReference('');
    setSubmitError('');
    setSubmitNotice('');
    setSubmitResult(null);
  };

  useEffect(() => {
    const timer = window.setInterval(() => {
      setLiveAvailmentIndex((current) => (current + 1) % FAKE_AVAILMENTS.length);
    }, 2600);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const incomingProduct = params.get('product');
    if (!incomingProduct) {
      return;
    }

    const normalizedIncoming = decodeURIComponent(incomingProduct).trim().toLowerCase();
    const exactMatch = availableProducts.find((item) => item.name.toLowerCase() === normalizedIncoming);
    const fuzzyMatch = availableProducts.find((item) => item.name.toLowerCase().includes(normalizedIncoming));
    const resolved = exactMatch ?? fuzzyMatch;
    if (!resolved) {
      return;
    }

    setSelectedProductName(resolved.name);
    setProductQuery(resolved.name);
    setSelectedProducts([resolved]);
  }, [availableProducts]);

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
    if (!isSubmitting) {
      if (uploadSfxIntervalRef.current !== null) {
        window.clearInterval(uploadSfxIntervalRef.current);
        uploadSfxIntervalRef.current = null;
      }
      return;
    }

    playUploadSfx();
    uploadSfxIntervalRef.current = window.setInterval(() => {
      playUploadSfx();
    }, 170);

    return () => {
      if (uploadSfxIntervalRef.current !== null) {
        window.clearInterval(uploadSfxIntervalRef.current);
        uploadSfxIntervalRef.current = null;
      }
    };
  }, [isSubmitting, playUploadSfx]);

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

  useEffect(() => {
    let timer: number;
    if (stage === 3 && paymentStatus === 'pending' && paymentTimer > 0) {
      timer = window.setInterval(() => {
        setPaymentTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => window.clearInterval(timer);
  }, [stage, paymentStatus, paymentTimer]);

  const resetToStage2 = useCallback((delayMs = 3000) => {
    setTimeout(() => {
      setStage(2);
      setPaymentIntentId('');
      setPaymongoQrUrl('');
      setPaymentStatus('pending');
      setPaymentPaidBanner(false);
      setSubmitError('');
      setPaymentTimer(60);
    }, delayMs);
  }, []);

  const checkStatus = useCallback(async () => {
    if (!paymentIntentId) return;
    try {
      const res = await fetch(`/api/paymongo-status?intentId=${paymentIntentId}`);
      const data = await res.json();
      if (data.ok && data.status === 'paid') {
        setPaymentStatus('paid');
        setPaymentPaidBanner(true);
        resetToStage2(3000);
      } else if (data.ok && data.status === 'failed') {
        setPaymentStatus('failed');
        setSubmitError('Payment was cancelled or failed. Please try again.');
        resetToStage2(3000);
      }
    } catch (err) {
      console.error('Polling error:', err);
    }
  }, [paymentIntentId, resetToStage2]);

  useEffect(() => {
    if (stage !== 3 || !paymentIntentId) {
      if (stage !== 3) setPaymentTimer(60);
      return;
    }

    const pollInterval = window.setInterval(checkStatus, 5000);
    checkStatus();

    const channel = supabase
      .channel('order-status')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'orders',
        filter: `payment_intent_id=eq.${paymentIntentId}`
      }, (payload) => {
        console.log('Order update received:', payload.new);
        if (payload.new.status === 'paid') {
          setPaymentStatus('paid');
          setPaymentPaidBanner(true);
          resetToStage2(3000);
        }
      })
      .subscribe();

    return () => {
      window.clearInterval(pollInterval);
      supabase.removeChannel(channel);
    };
  }, [stage, paymentIntentId, checkStatus, resetToStage2]);

  useEffect(() => {
    const handlePressFeedback = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest('button');
      if (!button || button.hasAttribute('disabled')) {
        return;
      }

      button.classList.remove('cyber-tap');
      window.requestAnimationFrame(() => {
        button.classList.add('cyber-tap');
      });

      const isPrimary = button.classList.contains('cyber-btn-primary');
      playTapSfx(isPrimary ? 'strong' : 'soft');

      if (sfxEnabled && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(isPrimary ? 18 : 10);
      }
    };

    const handleAnimationEnd = (event: AnimationEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.classList.contains('cyber-tap')) {
        target.classList.remove('cyber-tap');
      }
    };

    document.addEventListener('pointerdown', handlePressFeedback);
    document.addEventListener('animationend', handleAnimationEnd, true);

    return () => {
      document.removeEventListener('pointerdown', handlePressFeedback);
      document.removeEventListener('animationend', handleAnimationEnd, true);
    };
  }, [playTapSfx]);

  const handleDownloadQr = () => {
    if (!canDownloadPaymongoQr) {
      return;
    }
    const link = document.createElement('a');
    link.href = paymongoQrSrc;
    link.download = paymongoQrFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadReferenceFile = useCallback(() => {
    if (!submitResult?.serialNo) {
      return;
    }

    const productLines = orderSummaryItems.length > 0
      ? orderSummaryItems.map((item) => `- ${item.name} (PHP ${item.amount})`)
      : ['- N/A'];

    const fileBody = [
      'DMERCH PURCHASE REFERENCE',
      '',
      `Reference Code: ${submitResult.serialNo}`,
      `Sequence No: ${submitResult.sequenceNo ?? 'N/A'}`,
      `Total Amount: PHP ${submitResult.totalAmount ?? totalAmount}`,
      'Payment Portal: PAYMONGO GCASH',
      `Email Status: ${submitResult.customerEmailStatus ?? submitResult.emailStatus ?? 'N/A'}`,
      `Created At: ${submitResult.createdAt ?? new Date().toISOString()}`,
      '',
      'Products:',
      ...productLines,
    ].join('\n');

    const blob = new Blob([fileBody], { type: 'text/plain;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = `${submitResult.serialNo}-reference.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(objectUrl);
  }, [orderSummaryItems, submitResult, totalAmount]);

  const goToHome = useCallback(() => {
    window.location.href = '/';
  }, []);

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

  const sortedDeliveryProducts = useMemo(() => {
    return [...deliveryProducts].sort((a, b) => {
      const aRejected = a.status === 'rejected';
      const bRejected = b.status === 'rejected';
      if (aRejected !== bRejected) {
        return aRejected ? 1 : -1;
      }
      return a.name.localeCompare(b.name);
    });
  }, [deliveryProducts]);

  const handlePortalDeliveryAuth = async () => {
    const emailValue = (email ?? '').trim().toLowerCase();
    if (!emailValue) {
      setDeliveryError('Enter your email in Client Details first.');
      return;
    }

    setDeliveryLoading(true);
    setDeliveryError('');
    setDeliveryStatus('Verifying secure download access...');
    try {
      const response = await fetch('/api/delivery?path=auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailValue }),
      });
      const payload = (await response.json()) as { ok: boolean; token?: string; products?: DeliveryProduct[]; error?: string };
      if (!response.ok || !payload.ok || !payload.token) {
        setDeliveryError(payload.error ?? 'Unable to verify download access.');
        setDeliveryStatus('');
        return;
      }
      setDeliveryToken(payload.token);
      setDeliveryProducts(payload.products ?? []);
      setDeliveryStatus('Access granted. Download your approved items below.');
    } catch (err) {
      setDeliveryError(err instanceof Error ? err.message : 'Download access failed.');
      setDeliveryStatus('');
    } finally {
      setDeliveryLoading(false);
    }
  };

  const handlePortalDownload = async (productName: string) => {
    if (!deliveryToken) {
      setDeliveryError('Verify access first.');
      return;
    }
    setDownloadingDeliveryProduct(productName);
    setDeliveryError('');
    try {
      const response = await fetch('/api/delivery?path=download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: deliveryToken, productName }),
      });
      const payload = (await response.json()) as { ok: boolean; downloadTicket?: string; error?: string };
      if (!payload.ok || !payload.downloadTicket) {
        setDeliveryError(payload.error ?? 'Download is not available yet.');
        return;
      }
      const downloadUrl = `/api/delivery?path=file&ticket=${encodeURIComponent(payload.downloadTicket)}&cb=${Date.now()}`;
      window.open(downloadUrl, '_blank');
    } catch (err) {
      setDeliveryError(err instanceof Error ? err.message : 'Download failed.');
    } finally {
      setDownloadingDeliveryProduct('');
    }
  };

  const removeSelectedProduct = (productName: string) => {
    setSelectedProducts((prev) => prev.filter((item) => item.name !== productName));
  };

  const handleSubmitVerification = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (paymentStatus === 'paid') return;

    // No required field errors as per user request
    const paymentDetailUsed = (paymongoReference ?? '').trim() || 'MANUAL-FB-VERIFY';
    setSubmitError('');

    const normalizedReferenceNo = '000000'; // Placeholder since field is removed

    setSubmitError('');
    setSubmitNotice('');
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
          referenceNo: normalizedReferenceNo,
          paymentPortalUsed,
          paymentDetailUsed,
        }),
      });

      const payload = (await response.json()) as VerificationApiResponse;
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? 'Unable to submit verification request.');
      }

      setSubmitProgress(100);
      setSubmitResult(payload);
      if (payload.notice) {
        setSubmitNotice(payload.notice);
      } else if (payload.customerEmailDelivered === false) {
        setSubmitNotice(`Reference code generated, but customer email failed to send (${payload.customerEmailStatus ?? 'delivery issue'}). Please recheck email settings.`);
      } else {
        setSubmitNotice('');
      }
      setLastSubmittedProducts(selectedProducts);
      setUsername('');
      setEmail('');
      setReferenceNo('');
      setPaymongoReference('');
      setProductQuery('');
      setSelectedProductName('');
      setSelectedProducts([]);
      window.localStorage.removeItem(CHECKOUT_DRAFT_KEY);
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

  const stageItems: Array<{ id: FlowStage; title: string; mobileTitle: string }> = [
    { id: 1, title: 'Client Details', mobileTitle: 'Client' },
    { id: 2, title: 'Order', mobileTitle: 'Order' },
    { id: 3, title: 'Payment Portal', mobileTitle: 'Portal' },
    { id: 4, title: 'Confirmation', mobileTitle: 'Confirm' },
  ];
  const activeStageItem = stageItems.find((item) => item.id === stage) ?? stageItems[0];

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
        <header className="text-center mb-4 sm:mb-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
          >
            <div className="inline-block border-2 border-cyan-500 px-5 py-3 sm:px-8 sm:py-4 mb-4 relative">
              <div className="absolute -top-1 -left-1 w-3 h-3 bg-cyan-500" />
              <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-cyan-500" />
              <h1 className="text-3xl sm:text-4xl md:text-6xl font-black tracking-tighter uppercase italic flex items-center justify-center gap-3">
                <img
                  src="/android-chrome-512x512.png"
                  alt="DMerch logo"
                  className="h-[52px] w-[52px] sm:h-[62px] sm:w-[62px] md:h-[73px] md:w-[73px] object-contain drop-shadow-[0_0_10px_rgba(0,243,255,0.7)]"
                />
                <GlitchText text="DMERCH" />
              </h1>
            </div>
            <p className="text-cyan-400/80 font-mono text-[11px] sm:text-sm tracking-[0.25em] sm:tracking-[0.3em] uppercase">
              Secure Transaction Protocol v2.4.0
            </p>

            <div className="mx-auto mt-2 w-full max-w-xl rounded-lg bg-black/35 px-3 py-2 text-left">
              <div className="mb-1 flex items-center justify-between text-[10px] font-mono uppercase tracking-[0.18em] text-cyan-300">
                <span>Live Availment Feed</span>
                <span className="inline-flex items-center gap-1 text-cyan-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 animate-pulse" />
                  Live
                </span>
              </div>
              <div className="overflow-hidden">
                <AnimatePresence mode="wait">
                  <motion.p
                    key={`${activeAvailment.buyer}-${liveAvailmentIndex}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.28 }}
                    className="truncate whitespace-nowrap text-[11px] sm:text-xs text-cyan-100 leading-relaxed"
                  >
                    <span className="font-mono uppercase tracking-[0.08em] text-cyan-300">{activeAvailment.timeLabel}</span>{' '}
                    <span className="font-semibold text-cyan-50">{activeAvailment.buyer}</span> from{' '}
                    <span className="text-cyan-200">{activeAvailment.location}</span> availed{' '}
                    <span className="font-semibold text-cyan-50">{activeAvailment.product}</span>
                  </motion.p>
                </AnimatePresence>
              </div>
            </div>

          </motion.div>
        </header>

        <div className="mb-6 sm:mb-10 rounded-xl border border-cyan-500/30 bg-[#070a12]/70 p-3 sm:p-4 shadow-[0_0_20px_rgba(0,243,255,0.1)] sm:shadow-[0_0_30px_rgba(0,243,255,0.12)]">
          <div className="mx-auto w-full sm:max-w-md">
            <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
              <button type="button" className="cyber-stage-chip cyber-stage-chip-mobile cyber-stage-chip-active w-full">
                <span className="flex items-center justify-between gap-2 text-[11px] sm:text-sm font-semibold uppercase tracking-[0.1em] sm:tracking-[0.12em]">
                  <span className="truncate sm:hidden">{activeStageItem.mobileTitle}</span>
                  <span className="truncate hidden sm:inline">{activeStageItem.title}</span>
                  <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-[0.2em]">
                    <span className="h-2 w-2 rounded-full bg-current animate-pulse" />
                    <span className="hidden md:inline">Active</span>
                  </span>
                </span>
              </button>
            </motion.div>
          </div>

        </div>

        <AnimatePresence mode="wait">
          {stage === 2 ? (
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

                  <div className="mb-4 flex items-center justify-center gap-3">
                    <motion.div
                      animate={{ x: [0, 5, 0], opacity: [0.5, 1, 0.5] }}
                      transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                      className="text-cyan-400 drop-shadow-[0_0_8px_rgba(0,243,255,0.8)]"
                    >
                      <ChevronsRight size={20} />
                    </motion.div>

                    <a href="/catalog" className="cyber-btn cyber-btn-primary text-[10px] items-center justify-center py-2.5 px-6 cyber-breath">
                      View Products Catalog
                    </a>

                    <motion.div
                      animate={{ x: [0, -5, 0], opacity: [0.5, 1, 0.5] }}
                      transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                      className="text-cyan-400 drop-shadow-[0_0_8px_rgba(0,243,255,0.8)]"
                    >
                      <ChevronsLeft size={20} />
                    </motion.div>
                  </div>

                  <div className="relative mb-6">
                    <div className="relative">
                      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-cyan-400 drop-shadow-[0_0_6px_rgba(0,243,255,0.6)]" />
                      <input
                        value={productQuery}
                        onChange={(event) => setProductQuery(event.target.value)}
                        className="w-full rounded-md border border-cyan-500/50 bg-black/50 pl-10 pr-4 py-3 text-sm text-gray-100 outline-none transition focus:border-cyan-300 focus:shadow-[0_0_18px_rgba(0,255,255,0.2)]"
                        placeholder="SEARCH PRODUCTS OR CATEGORIES..."
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    {Object.entries(softwareProducts as Record<string, Record<string, ProductItem[]>>).length > 0 ? (
                      Object.entries(softwareProducts as Record<string, Record<string, ProductItem[]>>).map(([category, subs]) => {
                        const CatIcon = getCategoryIcon(category);
                        const isCatOpen = (productQuery ?? '').trim().length > 0 || expandedCats[category] === true;
                        const totalInCat = Object.values(subs as Record<string, ProductItem[]>).reduce((sum, arr) => sum + (arr as ProductItem[]).length, 0);

                        return (
                          <div key={category} className="rounded-lg border border-cyan-500/25 bg-[#060b14]/80 overflow-hidden">
                            {/* Category Header */}
                            <button
                              type="button"
                              onClick={() => setExpandedCats((prev) => ({ ...prev, [category]: !prev[category] }))}
                              className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-cyan-500/5 transition-colors"
                            >
                              <div className="flex items-center gap-3">
                                <CatIcon size={16} className="text-[#ff00ff] drop-shadow-[0_0_6px_rgba(255,0,255,0.5)]" />
                                <span className="text-xs sm:text-sm font-black uppercase tracking-[0.2em] text-[#ff00ff]">{category}</span>
                                <span className="text-[9px] font-mono text-gray-500">{totalInCat} items</span>
                              </div>
                              {isCatOpen
                                ? <ChevronDown size={16} className="text-cyan-400" />
                                : <ChevronRightIcon size={16} className="text-gray-500" />
                              }
                            </button>

                            {/* Sub-categories (collapsible) */}
                            {isCatOpen && (
                              <div className="border-t border-cyan-500/15">
                                {Object.entries(subs as Record<string, ProductItem[]>).map(([sub, products]) => {
                                  const subKey = `${category}::${sub}`;
                                  const isSubOpen = (productQuery ?? '').trim().length > 0 || expandedSubs[subKey] === true;

                                  return (
                                    <div key={subKey} className="border-b border-cyan-500/10 last:border-b-0">
                                      {/* Sub-category Header */}
                                      <button
                                        type="button"
                                        onClick={() => setExpandedSubs((prev) => ({ ...prev, [subKey]: !prev[subKey] }))}
                                        className="w-full flex items-center justify-between gap-2 px-6 py-2.5 hover:bg-cyan-500/5 transition-colors"
                                      >
                                        <div className="flex items-center gap-2">
                                          {isSubOpen
                                            ? <ChevronDown size={12} className="text-cyan-400" />
                                            : <ChevronRightIcon size={12} className="text-gray-600" />
                                          }
                                          <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-cyan-300">{sub}</span>
                                        </div>
                                        <span className="text-[9px] font-mono text-gray-500">{(products as ProductItem[]).length}</span>
                                      </button>

                                      {/* Product List (collapsible) */}
                                      {isSubOpen && (
                                        <div className="bg-black/20">
                                          {products.map((product) => (
                                            <ProductListItem
                                              key={product.name}
                                              product={product}
                                              onAdd={addProductToCart}
                                            />
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <div className="rounded-md border border-dashed border-cyan-500/30 px-4 py-12 text-center">
                        <PackageSearch className="mx-auto mb-3 text-gray-600" size={32} />
                        <p className="text-xs font-mono uppercase tracking-[0.2em] text-gray-500">No matching products found</p>
                      </div>
                    )}
                  </div>

                  {hasCourses && (
                    <div className="mt-4 rounded-lg border border-[#ff00ff]/30 bg-[#1a051a]/80 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setShowCourses(!showCourses)}
                        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-[#ff00ff]/5 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <GraduationCap size={16} className="text-[#ff00ff] drop-shadow-[0_0_6px_rgba(255,0,255,0.5)]" />
                          <span className="text-xs sm:text-sm font-black uppercase tracking-[0.2em] text-[#ff00ff]">COURSES</span>
                          <span className="text-[9px] font-mono text-gray-500">{courseCount} available</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[8px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 uppercase tracking-wider">
                            Preview
                          </span>
                          {showCourses
                            ? <ChevronDown size={16} className="text-cyan-400" />
                            : <ChevronRightIcon size={16} className="text-gray-500" />
                          }
                        </div>
                      </button>

                      {showCourses && (
                        <div className="border-t border-[#ff00ff]/15 bg-black/20">
                          {Object.entries(coursesProducts as Record<string, ProductItem[]>).map(([sub, courses]) => {
                            const subKey = `courses::${sub}`;
                            const isSubOpen = expandedSubs[subKey] === true;

                            return (
                              <div key={sub} className="border-b border-[#ff00ff]/10 last:border-b-0">
                                <button
                                  type="button"
                                  onClick={() => setExpandedSubs((prev) => ({ ...prev, [subKey]: !prev[subKey] }))}
                                  className="w-full flex items-center justify-between gap-2 px-6 py-2.5 hover:bg-[#ff00ff]/5 transition-colors"
                                >
                                  <div className="flex items-center gap-2">
                                    {isSubOpen
                                      ? <ChevronDown size={12} className="text-cyan-400" />
                                      : <ChevronRightIcon size={12} className="text-gray-600" />
                                    }
                                    <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-[#ff00ff]">{sub}</span>
                                  </div>
                                  <span className="text-[9px] font-mono text-gray-500">{(courses as ProductItem[]).length}</span>
                                </button>

                                {isSubOpen && (
                                  <div className="bg-black/20 pb-2">
                                    {(courses as ProductItem[]).map((course) => (
                                      <div
                                        key={course.name}
                                        className="mx-2 px-4 py-3 flex items-center justify-between gap-3 rounded-md border border-[#ff00ff]/10 bg-black/30 hover:bg-[#ff00ff]/5 transition-all group cursor-pointer"
                                        onClick={() => setPreviewCourse(course)}
                                      >
                                        <div className="flex-1 min-w-0">
                                          <p className="text-sm text-gray-200 truncate group-hover:text-[#ff00ff] transition-colors">{course.name}</p>
                                          <p className="text-[11px] font-mono text-amber-300 mt-0.5">PHP {course.amount}</p>
                                        </div>
                                        <button
                                          type="button"
                                          className="flex-shrink-0 px-3 py-1.5 rounded border border-amber-500/40 bg-amber-500/10 text-amber-300 text-[9px] font-bold uppercase tracking-[0.1em] hover:bg-amber-500/20 transition-colors flex items-center gap-1.5"
                                        >
                                          <Eye size={12} />
                                          Preview
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="mt-4 rounded-xl border border-cyan-500/40 bg-[#031018]/80 p-4 shadow-[0_0_30px_rgba(0,195,255,0.1)]">
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full min-w-[660px] border-collapse text-xs sm:text-sm font-mono uppercase tracking-[0.12em] text-cyan-100">
                        <thead>
                          <tr className="border-b border-cyan-500/30 text-cyan-300">
                            <th className="py-2 px-2 text-left font-semibold">Product</th>
                            <th className="py-2 px-2 text-left font-semibold">Category</th>
                            <th className="py-2 px-2 text-right font-semibold">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedProducts.length > 0 ? (
                            selectedProducts.map((item) => (
                              <tr key={`${item.name}-${item.amount}`} className="border-b border-cyan-500/15">
                                <td className="py-2 px-2 text-left normal-case tracking-normal break-words">
                                  <div className="flex items-center justify-between gap-2">
                                    <span>{item.name}</span>
                                    <button
                                      type="button"
                                      onClick={() => removeSelectedProduct(item.name)}
                                      className="inline-flex h-6 w-6 items-center justify-center rounded border border-red-400/40 text-red-300 hover:bg-red-500/10"
                                      title="Remove product"
                                    >
                                      <X size={12} />
                                    </button>
                                  </div>
                                </td>
                                <td className="py-2 px-2 text-left normal-case tracking-normal">{item.category || 'Software'}</td>
                                <td className="py-2 px-2 text-right">PHP {item.amount}</td>
                              </tr>
                            ))
                          ) : (
                            <tr className="border-b border-cyan-500/15">
                              <td className="py-3 px-2 text-center text-gray-500" colSpan={3}>No products to review yet</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    <div className="space-y-2 md:hidden">
                      {selectedProducts.length > 0 ? (
                        selectedProducts.map((item) => (
                          <div key={`${item.name}-${item.amount}`} className="rounded-md border border-cyan-500/25 bg-black/35 px-3 py-3">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-cyan-300">Product</p>
                                <p className="mt-1 text-sm text-cyan-100 normal-case tracking-normal break-words">{item.name}</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeSelectedProduct(item.name)}
                                className="inline-flex h-6 w-6 items-center justify-center rounded border border-red-400/40 text-red-300 hover:bg-red-500/10"
                                title="Remove product"
                              >
                                <X size={12} />
                              </button>
                            </div>
                            <div className="mt-2 grid grid-cols-1 gap-2">
                              <div>
                                <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-cyan-300">Category</p>
                                <p className="text-xs text-cyan-100 normal-case tracking-normal">{item.category || 'Software'}</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-cyan-300">Amount</p>
                                <p className="text-xs text-cyan-100">PHP {item.amount}</p>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-md border border-cyan-500/25 bg-black/35 px-3 py-3 text-center text-xs text-gray-500">No products to review yet</div>
                      )}
                    </div>

                    <div className="mt-3 flex flex-col gap-2 rounded-md border border-cyan-500/20 bg-cyan-500/5 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs font-mono uppercase tracking-[0.15em] text-cyan-100">Total: PHP {totalAmount}</p>
                    </div>

                    {submitResult?.ok ? (
                      <div className="mt-4 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Check size={16} className="text-emerald-400" />
                          <p className="text-sm font-bold text-emerald-300">Order Submitted Successfully!</p>
                        </div>
                        <p className="text-xs text-emerald-100/70 mb-2">Your order has been submitted for approval. You will receive an email once approved.</p>
                        <p className="text-xs font-mono text-emerald-200">Reference: {submitResult.serialNo}</p>
                      </div>
                    ) : null}

                    {paymentStatus === 'failed' ? (
                      <div className="mt-4 rounded-md border border-red-500/40 bg-red-500/10 px-4 py-4">
                        <div className="flex items-center gap-2 mb-2">
                          <p className="text-sm font-bold text-red-300">Payment Failed</p>
                        </div>
                        <p className="text-xs text-red-100/70">Your payment was not successful. Please try again.</p>
                      </div>
                    ) : null}
                  </div>



                  <div className="mt-4 rounded-lg border border-cyan-500/30 bg-[#06101a]/80 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[11px] font-mono uppercase tracking-[0.25em] text-cyan-300">Secure Download Access</p>
                      <button
                        type="button"
                        onClick={handlePortalDeliveryAuth}
                        disabled={deliveryLoading}
                        className="cyber-btn cyber-btn-secondary"
                      >
                        <ShieldCheck size={14} /> {deliveryLoading ? 'Verifying...' : 'Verify Access'}
                      </button>
                    </div>
                    <p className="mt-2 text-xs text-cyan-100/70">Uses your email from Client Details to unlock approved downloads.</p>
                    {deliveryStatus ? (
                      <p className="mt-2 text-xs text-cyan-200">{deliveryStatus}</p>
                    ) : null}
                    {deliveryError ? (
                      <p className="mt-2 text-xs text-red-300">{deliveryError}</p>
                    ) : null}

                    {sortedDeliveryProducts.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        {sortedDeliveryProducts.map((product) => (
                          <div key={`${product.name}-${product.amount}`} className="rounded-md border border-cyan-500/20 bg-black/35 px-3 py-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <p className="text-xs font-semibold text-cyan-100">{product.name}</p>
                                <p className="text-[10px] text-cyan-200">OS: {product.os ?? 'Multi'} | PHP {product.amount}</p>
                                {product.status === 'rejected' ? (
                                  <p className="mt-1 text-[9px] font-mono uppercase tracking-[0.2em] text-red-300">Cancelled</p>
                                ) : null}
                              </div>
                              <button
                                type="button"
                                onClick={() => handlePortalDownload(product.name)}
                                disabled={downloadingDeliveryProduct === product.name || product.status === 'rejected'}
                                className="cyber-btn cyber-btn-primary"
                              >
                                <Download size={13} /> {product.status === 'rejected' ? 'Cancelled' : (downloadingDeliveryProduct === product.name ? 'Starting...' : 'Download')}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="mt-6 flex flex-col gap-3 rounded-md border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 sm:flex-row sm:items-center">
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={handleClientSignOut}
                    className="cyber-btn cyber-btn-secondary border-red-400/60 text-red-200 hover:text-white"
                  >
                    <LogOut size={15} /> Sign Out
                  </motion.button>
                  <span className="flex-1 text-center text-xs font-mono uppercase tracking-[0.22em] text-cyan-200">
                    Products: {selectedProducts.length} | Total: PHP {totalAmount}
                  </span>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {!isStageLocked && (
                      <motion.button type="button" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={goToPreviousStage} className="cyber-btn cyber-btn-secondary">
                        <ArrowLeft size={15} /> Back
                      </motion.button>
                    )}
                    <motion.button
                      type="button"
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={goToNextStage}
                      disabled={isCreatingPayment}
                      className="cyber-btn cyber-btn-primary"
                    >
                      {isCreatingPayment ? 'Processing...' : (submitResult?.ok ? 'View Order Status' : 'Pay Now')} <ArrowRight size={15} />
                    </motion.button>
                  </div>
                </div>

                {submitError && (
                  <div className="mt-4 rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-[10px] font-mono uppercase tracking-[0.15em] text-red-300">
                    <div className="flex items-center gap-2 mb-1">
                      <AlertCircle size={14} /> <span>System Error Details:</span>
                    </div>
                    {submitError}
                  </div>
                )}
              </CyberCard>

              <AnimatePresence>
                {previewCourse && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
                    onClick={() => setPreviewCourse(null)}
                  >
                    <motion.div
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.9, opacity: 0 }}
                      onClick={(e) => e.stopPropagation()}
                      className="relative w-full max-w-lg rounded-xl border border-[#ff00ff]/50 bg-[#0a0a0a] p-0 overflow-hidden shadow-[0_0_50px_rgba(255,0,255,0.3)]"
                    >
                      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#ff00ff] via-cyan-500 to-[#ff00ff] animate-pulse" />

                      <div className="p-6">
                        <div className="flex items-start justify-between gap-4 mb-4">
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-[#ff00ff]/20 border border-[#ff00ff]/40">
                              <GraduationCap size={24} className="text-[#ff00ff]" />
                            </div>
                            <div>
                              <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-amber-300">Course Preview</p>
                              <h3 className="text-lg font-bold text-white leading-tight">{previewCourse.name}</h3>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setPreviewCourse(null)}
                            className="p-1.5 rounded-full border border-gray-600 hover:border-red-400 hover:bg-red-500/10 transition-colors"
                          >
                            <X size={16} className="text-gray-400 hover:text-red-300" />
                          </button>
                        </div>

                        <div className="space-y-4">
                          <div className="flex items-center gap-4 text-xs text-gray-400">
                            <div className="flex items-center gap-1.5">
                              <Clock size={14} className="text-cyan-400" />
                              <span>Lifetime Access</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Users size={14} className="text-cyan-400" />
                              <span>Self-Paced</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <FileText size={14} className="text-cyan-400" />
                              <span>Certificate</span>
                            </div>
                          </div>

                          <div className="p-4 rounded-lg bg-black/40 border border-cyan-500/20">
                            <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-cyan-300 mb-2">What You'll Learn</p>
                            <ul className="space-y-2">
                              {['Comprehensive curriculum', 'Hands-on projects', 'Lifetime access', 'Certificate of completion'].map((item, i) => (
                                <li key={i} className="flex items-center gap-2 text-sm text-gray-300">
                                  <Star size={12} className="text-amber-400 flex-shrink-0" />
                                  {item}
                                </li>
                              ))}
                            </ul>
                          </div>

                          {previewCourse.fileLink && (
                            <a
                              href={previewCourse.fileLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center justify-center gap-2 w-full py-3 rounded-lg border border-cyan-500/40 bg-cyan-500/10 text-cyan-300 text-sm font-semibold hover:bg-cyan-500/20 transition-colors"
                            >
                              <Eye size={16} />
                              Preview Course Content
                            </a>
                          )}

                          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                            <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-amber-300 text-center">
                              This is a preview only. Purchase to unlock full access.
                            </p>
                          </div>

                          <div className="flex items-center justify-between pt-2 border-t border-gray-800">
                            <div>
                              <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-gray-500">Price</p>
                              <p className="text-2xl font-black text-[#ff00ff] drop-shadow-[0_0_10px_rgba(255,0,255,0.5)]">PHP {previewCourse.amount}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                addProductToCart(previewCourse);
                                setPreviewCourse(null);
                              }}
                              className="px-6 py-3 rounded-lg bg-gradient-to-r from-[#ff00ff] to-cyan-500 text-white font-bold text-sm uppercase tracking-wider hover:shadow-[0_0_20px_rgba(255,0,255,0.5)] transition-all"
                            >
                              Add to Cart
                            </button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ) : stage === 1 ? (
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

                  <div className="mt-6 flex flex-col items-center gap-3">
                    <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-cyan-300/80">OR</p>
                    <button
                      type="button"
                      onClick={() => { void handleAdminGoogleShortcut(); }}
                      className="inline-flex h-11 w-full max-w-[260px] items-center justify-center gap-2 rounded-md border border-cyan-400/40 bg-black/45 px-4 text-sm font-semibold text-cyan-100 transition hover:border-cyan-300/70 hover:text-white"
                      aria-label="Admin sign in with Google"
                      title="Admin sign in with Google"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true" focusable="false">
                        <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303C33.655 32.657 29.196 36 24 36c-6.627 0-12-5.373-12-12S17.373 12 24 12c3.059 0 5.842 1.154 7.959 3.041l5.657-5.657C34.053 6.053 29.274 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
                        <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 16.109 19.002 12 24 12c3.059 0 5.842 1.154 7.959 3.041l5.657-5.657C34.053 6.053 29.274 4 24 4c-7.682 0-14.319 4.337-17.694 10.691z" />
                        <path fill="#4CAF50" d="M24 44c5.176 0 9.86-1.977 13.409-5.191l-6.19-5.238C29.148 35.091 26.715 36 24 36c-5.176 0-9.617-3.318-11.266-7.946l-6.522 5.025C9.548 39.556 16.227 44 24 44z" />
                        <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.084 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
                      </svg>
                      Continue with Google
                    </button>
                    <p className="text-center text-[11px] text-cyan-200/85">
                      We recommend signing in with Google to avoid typo errors in your email.
                    </p>
                    {adminShortcutError ? <p className="text-center text-[11px] text-amber-200">{adminShortcutError}</p> : null}
                  </div>
                </div>

                <div className="mt-7 flex flex-col sm:flex-row items-center justify-end gap-3">
                  <motion.button type="button" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={goToNextStage} className="cyber-btn cyber-btn-primary">
                    Next: Order <ArrowRight size={15} />
                  </motion.button>
                </div>
              </CyberCard>
            </motion.div>
          ) : stage === 3 ? (
            <motion.div
              key="stage-3-portal"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              transition={{ duration: 0.3 }}
              className="w-full flex flex-col items-center"
            >
              <div className="w-full max-w-2xl mb-6">
                <CyberCard title="GCASH Payment Terminal" icon={QrCode} color="cyan">
                  <div className="flex flex-col items-center p-6 bg-[#031018]/90 rounded-xl border border-cyan-500/30 gap-6">
                    <div className="text-center">
                      <h3 className="text-xl font-black text-cyan-400 uppercase tracking-widest mb-1 italic">Scan to Pay via GCASH</h3>
                      <p className="text-xs text-cyan-200/70 font-mono uppercase tracking-[0.2em]">Secure Transaction Protocol v2.5.0</p>
                    </div>

                    {/* Cyber Countdown Timer */}
                    <div className="flex flex-col items-center gap-2">
                      <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-cyan-500/60">Terminal Expiry Countdown</p>
                      <div className="flex items-center gap-3 px-6 py-4 rounded-xl border border-cyan-500/40 bg-cyan-500/5 shadow-[0_0_20px_rgba(0,243,255,0.1)]">
                        <div className="text-4xl font-black font-mono text-cyan-300 drop-shadow-[0_0_10px_rgba(0,243,255,0.5)]">
                          00:00:{paymentTimer.toString().padStart(2, '0')}
                        </div>
                      </div>
                    </div>

                    <div className="relative group p-4 bg-white rounded-2xl shadow-[0_0_50px_rgba(0,243,255,0.25)] border-4 border-cyan-500">
                      {canDownloadPaymongoQr ? (
                        <div className="relative">
                          <img
                            src={paymongoQrSrc}
                            alt="PayMongo GCASH payment QR code"
                            className="w-64 h-64 sm:w-80 sm:h-80 object-contain"
                            onError={() => setPaymongoQrError(true)}
                          />
                          {paymentStatus === 'paid' && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/80 rounded-xl backdrop-blur-md">
                              <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                className="flex flex-col items-center"
                              >
                                <div className="h-16 w-16 rounded-full bg-emerald-500 flex items-center justify-center mb-2 shadow-[0_0_20px_rgba(16,185,129,0.6)]">
                                  <Check size={32} className="text-white" />
                                </div>
                                <span className="text-sm font-black text-emerald-400 uppercase tracking-widest">Payment Received</span>
                              </motion.div>
                            </div>
                          )}
                          {(paymentTimer <= 0 && paymentStatus === 'pending') && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/90 rounded-xl backdrop-blur-sm border-2 border-red-500/50">
                              <div className="flex flex-col items-center p-4 text-center">
                                <AlertCircle size={40} className="text-red-500 mb-4 animate-pulse" />
                                <span className="text-sm font-black text-red-400 uppercase tracking-widest mb-4">QR Terminal Expired</span>
                                <button
                                  onClick={() => setStage(2)}
                                  className="cyber-btn cyber-btn-primary px-6 py-2 bg-red-500/20 border-red-500 text-red-200"
                                >
                                  RESTART SESSION
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="w-64 h-64 sm:w-80 sm:h-80 flex flex-col items-center justify-center text-black/40">
                          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-600 mb-4" />
                          <p className="text-sm font-mono uppercase font-bold text-black/60">QR Initializing...</p>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col items-center gap-2">
                      <button
                        onClick={checkStatus}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg border border-cyan-500/30 bg-cyan-500/5 text-cyan-300 text-[10px] font-mono uppercase tracking-[0.2em] hover:bg-cyan-500/20 transition-all"
                      >
                        <Clock size={12} className="animate-spin-slow" />
                        Refresh Signal
                      </button>
                    </div>

                    <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-cyan-500/20">
                      <div className="p-3 rounded-lg border border-cyan-500/20 bg-black/40">
                        <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-cyan-400 mb-1">Total Amount</p>
                        <p className="text-lg font-bold text-white leading-none">PHP {totalAmount.toFixed(2)}</p>
                      </div>
                      <div className="p-3 rounded-lg border border-cyan-500/20 bg-black/40 overflow-hidden">
                        <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-cyan-400 mb-1">Order Ref</p>
                        <p className="text-xs font-mono text-cyan-200 truncate">{paymentIntentId?.split('_')[1]?.toUpperCase() || 'GEN-PENDING'}</p>
                      </div>
                    </div>

                  </div>
                </CyberCard>
              </div>

              <div className="flex flex-col sm:flex-row justify-center gap-3">
                <motion.button type="button" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={goToPreviousStage} className="cyber-btn cyber-btn-secondary">
                  <ArrowLeft size={15} /> Back
                </motion.button>
                <motion.button type="button" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={goToNextStage} className="cyber-btn cyber-btn-primary">
                  Proceed to Verification <ArrowRight size={15} />
                </motion.button>
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={handleDownloadQr}
                  disabled={!canDownloadPaymongoQr}
                  className="cyber-btn cyber-btn-secondary border-cyan-400/40 text-cyan-100"
                >
                  <Download size={15} /> Save QR
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
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full min-w-[660px] border-collapse text-xs sm:text-sm font-mono uppercase tracking-[0.12em] text-cyan-100">
                      <thead>
                        <tr className="border-b border-cyan-500/30 text-cyan-300">
                          <th className="py-2 px-2 text-center font-semibold">Product</th>
                          <th className="py-2 px-2 text-center font-semibold">Category</th>
                          <th className="py-2 px-2 text-center font-semibold">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orderSummaryItems.length > 0 ? (
                          orderSummaryItems.map((item) => (
                            <tr key={`${item.name}-${item.amount}`} className="border-b border-cyan-500/15">
                              <td className="py-2 px-2 text-left normal-case tracking-normal break-words">{item.name}</td>
                              <td className="py-2 px-2 text-left normal-case tracking-normal">{item.category}</td>
                              <td className="py-2 px-2 text-right">PHP {item.amount}</td>
                            </tr>
                          ))
                        ) : (
                          <tr className="border-b border-cyan-500/15">
                            <td className="py-3 px-2 text-center text-gray-500" colSpan={3}>No products to review yet</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="space-y-2 md:hidden">
                    {orderSummaryItems.length > 0 ? (
                      orderSummaryItems.map((item) => (
                        <div key={`${item.name}-${item.amount}`} className="rounded-md border border-cyan-500/25 bg-black/35 px-3 py-3">
                          <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-cyan-300">Product</p>
                          <p className="mt-1 text-sm text-cyan-100 normal-case tracking-normal break-words">{item.name}</p>
                          <div className="mt-2 grid grid-cols-1 gap-2">
                            <div>
                              <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-cyan-300">Category</p>
                              <p className="text-xs text-cyan-100 normal-case tracking-normal">{item.category}</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-cyan-300">Amount</p>
                              <p className="text-xs text-cyan-100">PHP {item.amount}</p>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-md border border-cyan-500/25 bg-black/35 px-3 py-3 text-center text-xs text-gray-500">No products to review yet</div>
                    )}
                  </div>

                  <div className="mt-3 flex flex-col gap-2 rounded-md border border-cyan-500/20 bg-cyan-500/5 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs font-mono uppercase tracking-[0.15em] text-cyan-100">Total: PHP {submitResult?.totalAmount ?? totalAmount}</p>
                  </div>
                </div>

                <form onSubmit={handleSubmitVerification} className="space-y-6">
                  {paymentStatus === 'paid' ? (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="relative z-10 rounded-xl border border-emerald-500/40 bg-[#051a0e] p-8 shadow-[0_0_50px_rgba(16,185,129,0.2)] text-center"
                    >
                      <div className="pointer-events-none absolute left-2 top-2 h-5 w-5 border-l-2 border-t-2 border-emerald-400/80" />
                      <div className="pointer-events-none absolute bottom-2 right-2 h-5 w-5 border-b-2 border-r-2 border-emerald-400/80" />

                      <div className="mx-auto h-20 w-20 rounded-full bg-emerald-500 flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(16,185,129,0.4)]">
                        <Check size={40} className="text-white" />
                      </div>

                      <h2 className="text-2xl font-black text-emerald-400 uppercase tracking-widest mb-2 italic">Order Verified</h2>
                      <p className="text-sm text-emerald-100/70 font-mono uppercase tracking-[0.1em] mb-6">
                        Your payment has been confirmed automatically. <br />
                        A confirmation email with your access details has been sent to <strong>{email}</strong>.
                      </p>

                      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-[10px] font-mono uppercase tracking-[0.2em] text-emerald-400">
                        <ShieldCheck size={14} /> System ID: {paymentIntentId || 'DM-AUTO-VERIFIED'}
                      </div>
                    </motion.div>
                  ) : null}

                  {submitError ? (
                    <div className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs font-mono uppercase tracking-[0.15em] text-red-300">
                      {submitError}
                    </div>
                  ) : null}

                  {submitResult?.ok ? (
                    <div className="rounded-md border border-cyan-500/40 bg-cyan-500/10 px-4 py-4">
                      <p className="mb-2 text-xs font-mono uppercase tracking-[0.2em] text-cyan-300">Reference Code</p>
                      <div className="flex flex-wrap items-center gap-3">
                        <p className="text-lg font-black tracking-wider text-white">{submitResult.serialNo}</p>
                        <button
                          type="button"
                          onClick={handleDownloadReferenceFile}
                          className="reference-download-alert inline-flex items-center gap-1 rounded-md border border-red-400/60 bg-red-500/15 px-3 py-1 text-[10px] font-mono uppercase tracking-[0.18em] text-red-200"
                          title="Download reference file"
                        >
                          <Download size={13} /> Download file
                        </button>
                      </div>
                      <p className="mt-2 text-xs text-gray-300 leading-relaxed">
                        Keep this reference code for your records. Check your Inbox or Spam folder for email confirmation.
                      </p>
                      <p className="mt-2 text-xs text-gray-400">
                        Sequence: {submitResult.sequenceNo} | Total: PHP {submitResult.totalAmount ?? totalAmount} | Email status: {submitResult.customerEmailStatus ?? submitResult.emailStatus}
                      </p>
                    </div>
                  ) : null}

                  {paymentStatus !== 'paid' && !submitResult?.ok && (
                    <div className="space-y-4">

                      <div className="rounded-xl border border-cyan-500/40 bg-[#031018]/80 p-5 shadow-[0_0_30px_rgba(0,195,255,0.1)]">
                        <div className="mb-4">
                          <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-cyan-400 mb-2">Your Order Number</p>
                          <div className="relative group">
                            <p className="text-2xl font-black text-white tracking-widest bg-cyan-500/10 p-4 rounded border border-cyan-500/30 text-center shadow-[0_0_20px_rgba(0,243,255,0.1)]">
                              {paymentIntentId?.split('_')[1]?.toUpperCase() || `DM-${Math.floor(Date.now() / 1000).toString(36).toUpperCase()}`}
                            </p>
                            <div className="absolute inset-0 border border-cyan-500/20 rounded pointer-events-none animate-pulse" />
                          </div>
                          <p className="mt-3 text-sm text-cyan-200/70 italic text-center uppercase tracking-wider">Screenshot this and send it with your proof of payment.</p>
                        </div>

                        <label className="block border-t border-cyan-500/20 pt-4">
                          <span className="mb-3 block text-base font-black uppercase tracking-[0.25em] text-cyan-300">Message us your proof of payment at:</span>
                          <div className="mb-4">
                            <a
                              href="https://www.facebook.com/digitalmerch4862/"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xl font-black text-cyan-400 underline hover:text-cyan-300 transition-colors break-all shadow-[0_0_15px_rgba(0,243,255,0.2)]"
                            >
                              https://www.facebook.com/digitalmerch4862/
                            </a>
                          </div>
                        </label>
                      </div>
                    </div>
                  )}

                  {submitNotice ? (
                    <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs font-mono uppercase tracking-[0.12em] text-amber-200">
                      {submitNotice}
                    </div>
                  ) : null}

                  <div className="flex flex-col sm:flex-row gap-3 justify-between mt-8">
                    <motion.button type="button" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={goToPreviousStage} className="cyber-btn cyber-btn-secondary">
                      <ArrowLeft size={15} /> Back
                    </motion.button>

                    <motion.button
                      type="button"
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={handleClientSignOut}
                      className="cyber-btn cyber-btn-secondary border-red-400/60 text-red-200 hover:text-white"
                    >
                      <LogOut size={15} /> Sign Out
                    </motion.button>

                    {(submitResult?.ok || paymentStatus === 'paid') && (
                      <motion.button type="button" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={() => setStage(1)} className="cyber-btn cyber-btn-secondary border-emerald-400/40 text-emerald-100">
                        <Home size={15} /> Home
                      </motion.button>
                    )}

                    {paymentStatus !== 'paid' && (
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
                    )}
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
          )
          }
        </AnimatePresence >

        {/* Footer Info */}
        < footer className="mt-12 sm:mt-24 pt-6 sm:pt-8 border-t border-white/5 text-center hidden sm:block" >
          {/* Social Links */}
          < div className="flex justify-center gap-10 mb-10" >
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
              whileHover={{ scale: 1.15 }}
              href="mailto:digitalmerch4862@gmail.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-300 transition-colors"
              title="Email"
            >
              <Mail size={34} className="text-green-400 drop-shadow-[0_0_8px_rgba(34,197,94,0.8)]" />
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
          </div >
          <p className="text-gray-600 text-[10px] font-mono uppercase tracking-widest">
            © 2026 DMERCH PROTOCOL // ALL RIGHTS RESERVED // SYSTEM STATUS: OPTIMAL
          </p>
        </footer >
      </main >
    </div >
  );
}
