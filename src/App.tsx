/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { type ComponentType, type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldCheck, Facebook, Youtube, Instagram, Search, Check, ShoppingCart, X, ArrowRight, ArrowLeft, Home } from 'lucide-react';
import gcashQr from './gcash-qr.png';
import gotymeQr from './gotyme-qr.png';
import { productCatalog, type ProductItem } from './data/products';
import { getSupabaseBrowserClient } from './lib/supabase-browser';
import { supabase } from './supabaseClient.js';

const ADMIN_PRODUCTS_KEY = 'dmerch_admin_products_v1';
const ADMIN_GOOGLE_SHORTCUT_KEY = 'dmerch_admin_google_shortcut_v1';
const CHECKOUT_DRAFT_KEY = 'dmerch_checkout_draft_v1';
const PAYMONGO_SERIAL_KEY = 'dmerch_paymongo_serial_v1';
const ALLOWED_ADMIN_EMAILS = new Set(['rad4862@gmail.com', 'digitalmerch4862@gmail.com']);
const DIRECT_ADMIN_EMAIL = 'digitalmerch4862@gmail.com';
const RAD_TEST_EMAIL = 'rad4862@gmail.com';
const VIRTU_MART_EMAIL = 'virtumartph@gmail.com';
const isVirtuMart = (value: string | null | undefined) =>
  String(value ?? '').trim().toLowerCase() === VIRTU_MART_EMAIL;

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

type CheckoutDraft = {
  username: string;
  email: string;
  referenceNo: string;
  selectedMethod: 'gcash' | 'gotyme' | 'lazada' | 'shopee';
  paymentPortalUsed: 'gcash' | 'gotyme' | 'lazada' | 'shopee';
  gcashNumberUsed: string;
  gotymeAccountNameUsed: string;
  availedPortal?: 'lazada' | 'shopee';
  orderReferenceInput?: string;
  selectedProducts: ProductItem[];
};

type UpsellCategory =
  | 'Design Suite'
  | 'Video & Audio'
  | 'CAD & 3D'
  | 'Office & Productivity'
  | 'Utilities & Security'
  | 'Gaming'
  | 'Mobile Apps'
  | 'Other';

type FakeAvailment = {
  buyer: string;
  location: string;
  product: string;
  timeLabel: string;
};

const getProductCategory = (productName: string): UpsellCategory => {
  const name = productName.toLowerCase();

  if (/(adobe|canva|coreldraw|lightroom|photoshop|illustrator|indesign|fresco|xd)/.test(name)) {
    return 'Design Suite';
  }

  if (/(premiere|after effects|audition|media encoder|davinci|filmora|fl studio|protools|final cut|capcut|dehancer|topaz video|virtual dj)/.test(name)) {
    return 'Video & Audio';
  }

  if (/(autocad|autodesk|revit|maya|naviswork|solidworks|sketchup|rhino|vray|lumion|enscape)/.test(name)) {
    return 'CAD & 3D';
  }

  if (/(office|quickbooks|acrobat|foxit|wps|turbotax)/.test(name)) {
    return 'Office & Productivity';
  }

  if (/(mcafee|norton|easeus|winrar|idm|download manager|deep freeze|partition|virus|utilities)/.test(name)) {
    return 'Utilities & Security';
  }

  if (/(call of duty|nba|motogp|spider-man|sekiro|starcraft|red dead|cities - skylines)/.test(name)) {
    return 'Gaming';
  }

  if (/(android|apk|pixelcut|mobile)/.test(name)) {
    return 'Mobile Apps';
  }

  return 'Other';
};

const FAKE_AVAILMENTS: FakeAvailment[] = [
  { buyer: 'R***', location: 'Quezon City', product: 'Adobe Photoshop 2025', timeLabel: 'just now' },
  { buyer: 'M***', location: 'Cebu City', product: 'CANVA PREMIUM LIFE TIME', timeLabel: '9s ago' },
  { buyer: 'J***', location: 'Davao City', product: 'Microsoft Office Professional Plus 2024', timeLabel: '21s ago' },
  { buyer: 'A***', location: 'Pasig', product: 'Adobe Premiere Pro 2025', timeLabel: '34s ago' },
  { buyer: 'K***', location: 'Baguio', product: 'Autodesk AutoCAD 2024', timeLabel: '48s ago' },
  { buyer: 'P***', location: 'Iloilo', product: 'Wondershare Filmora 13', timeLabel: '1m ago' },
  { buyer: 'S***', location: 'Taguig', product: 'GO HIGH LEVEL SUB ACCOUNT MONTHLY', timeLabel: '1m ago' },
  { buyer: 'D***', location: 'Makati', product: 'Adobe Illustrator 2025', timeLabel: '2m ago' },
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

function MethodCard({ method, id, compact = false, selectedMethod, onSelectMethod }: { method: 'gcash' | 'gotyme'; id: string; compact?: boolean; selectedMethod: 'gcash' | 'gotyme'; onSelectMethod: (method: 'gcash' | 'gotyme') => void }) {
  const isActive = selectedMethod === method;
  const isGcash = method === 'gcash';

  return (
    <motion.button
      type="button"
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={() => onSelectMethod(method)}
      className={`relative cursor-pointer transition-all duration-300 border-2 overflow-hidden ${compact ? 'w-36 h-36' : 'w-44 h-64'} ${isActive
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
            initial={{ width: 0 }}
            animate={{ width: isActive ? '100%' : '30%' }}
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
  const [selectedMethod, setSelectedMethod] = useState<'gcash' | 'gotyme' | 'lazada' | 'shopee'>('gcash');
  const [paymentPortalUsed, setPaymentPortalUsed] = useState<'gcash' | 'gotyme' | 'lazada' | 'shopee'>('gcash');
  const [availedPortal, setAvailedPortal] = useState<'lazada' | 'shopee' | ''>('');
  const [orderReferenceInput, setOrderReferenceInput] = useState('');
  const [gcashNumberUsed, setGcashNumberUsed] = useState('');
  const [gotymeAccountNameUsed, setGotymeAccountNameUsed] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [referenceNo, setReferenceNo] = useState('');
  const [productQuery, setProductQuery] = useState('');
  const [selectedProductName, setSelectedProductName] = useState('');
  const [selectedProducts, setSelectedProducts] = useState<ProductItem[]>([]);
  const [availableProducts, setAvailableProducts] = useState<ProductItem[]>(productCatalog);
  const [isProductMenuOpen, setIsProductMenuOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitProgress, setSubmitProgress] = useState(0);
  const [submitError, setSubmitError] = useState('');
  const [submitNotice, setSubmitNotice] = useState('');
  const [adminShortcutError, setAdminShortcutError] = useState('');
  // True ONLY when the user has completed Google OAuth — not just typed an email
  const [isGoogleVerified, setIsGoogleVerified] = useState(false);
  const [googleSessionEmail, setGoogleSessionEmail] = useState('');
  const [confirmedSerialNo, setConfirmedSerialNo] = useState('');
  const [paymentCompleted, setPaymentCompleted] = useState(false);
  const [submitResult, setSubmitResult] = useState<VerificationApiResponse | null>(null);
  const [lastSubmittedProducts, setLastSubmittedProducts] = useState<ProductItem[]>([]);
  const [liveAvailmentIndex, setLiveAvailmentIndex] = useState(0);
  const productPickerRef = useRef<HTMLDivElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const uploadSfxIntervalRef = useRef<number | null>(null);
  const uploadSfxStepRef = useRef(0);
  const sfxEnabled = true;

  const selectedQrSrc = selectedMethod === 'gcash' ? gcashQr : gotymeQr;
  const selectedQrFilename = selectedMethod === 'gcash' ? 'dmerch-gcash-qr.png' : 'dmerch-gotyme-qr.png';
  const activeAvailment = FAKE_AVAILMENTS[liveAvailmentIndex % FAKE_AVAILMENTS.length];
  const isVirtuMartSession = isVirtuMart(googleSessionEmail);
  const isRadTestSession = String(googleSessionEmail).trim().toLowerCase() === RAD_TEST_EMAIL;
  const normalizedVirtuMartOrderRef = useMemo(() => {
    if (availedPortal === 'lazada') {
      return orderReferenceInput.replace(/\D/g, '');
    }
    return orderReferenceInput.trim().toUpperCase();
  }, [availedPortal, orderReferenceInput]);

  const isVirtuMartOrderRefValid = useMemo(() => {
    if (availedPortal === 'lazada') {
      return /^\d{10,24}$/.test(normalizedVirtuMartOrderRef);
    }
    if (availedPortal === 'shopee') {
      return /^#[A-Z0-9]{8,24}$/.test(normalizedVirtuMartOrderRef);
    }
    return false;
  }, [availedPortal, normalizedVirtuMartOrderRef]);

  useEffect(() => {
    const logVisit = async () => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;

      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;

      const page = window.location.pathname;
      const userAgent = window.navigator.userAgent;

      await supabase.from('analytics_visits').insert({
        page,
        user_agent: userAgent,
        username: user?.user_metadata?.full_name || user?.email || 'Anonymous',
        user_id: user?.id || null,
      });
    };

    const fetchSupabaseProducts = async () => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;

      const { data, error } = await supabase
        .from('products')
        .select('name, price')
        .order('name');

      if (!error && data && data.length > 0) {
        setAvailableProducts(data.map(p => ({
          name: String(p.name ?? '').trim(),
          amount: Number(p.price || 0),
        })));
      }
    };

    void logVisit();
    void fetchSupabaseProducts();

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
    };
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

      const selectedMethodValue = parsed.selectedMethod === 'gotyme' ? 'gotyme' : 'gcash';
      const paymentPortalValue = parsed.paymentPortalUsed === 'gotyme' ? 'gotyme' : 'gcash';
      const availedPortalValue = parsed.availedPortal === 'lazada' || parsed.availedPortal === 'shopee' ? parsed.availedPortal : '';

      setSelectedMethod(selectedMethodValue);
      setPaymentPortalUsed(paymentPortalValue);
      setAvailedPortal(availedPortalValue);
      setUsername(String(parsed.username ?? '').trim());
      setEmail(String(parsed.email ?? '').trim());
      setOrderReferenceInput(String(parsed.orderReferenceInput ?? '').trim());
      setReferenceNo(String(parsed.referenceNo ?? '').trim());
      setGcashNumberUsed(String(parsed.gcashNumberUsed ?? '').trim());
      setGotymeAccountNameUsed(String(parsed.gotymeAccountNameUsed ?? '').trim());
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
      setGoogleSessionEmail(normalizedEmail);
      // Mark this session as Google-verified (the ONLY place this becomes true)
      setIsGoogleVerified(true);
      setUsername((current) => {
        if (current.trim()) {
          return current;
        }
        const suggestedName = extractGoogleName(session?.user?.user_metadata);
        if (suggestedName) {
          return suggestedName;
        }
        return normalizedEmail.split('@')[0] ?? '';
      });

      if (normalizedEmail === DIRECT_ADMIN_EMAIL) {
        // Only auto-redirect if we're not explicitly trying to stay
        const stayOnCheckout = window.location.search.includes('stay=1');
        if (!stayOnCheckout) {
          window.localStorage.removeItem(CHECKOUT_DRAFT_KEY);
          window.localStorage.removeItem(ADMIN_GOOGLE_SHORTCUT_KEY);
          window.location.href = '/admin';
          return;
        }
      }

      if (shouldHandleShortcut) {
        window.localStorage.removeItem(ADMIN_GOOGLE_SHORTCUT_KEY);
        await supabase.auth.signOut();
        if (!mounted) {
          return;
        }
        setAdminShortcutError('Google sign-in complete. Email auto-filled. Continue checkout.');
        setStage(1);
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
      username: username.trim(),
      email: email.trim(),
      referenceNo: referenceNo.trim(),
      selectedMethod,
      paymentPortalUsed,
      availedPortal: availedPortal || undefined,
      orderReferenceInput: orderReferenceInput.trim(),
      gcashNumberUsed: gcashNumberUsed.trim(),
      gotymeAccountNameUsed: gotymeAccountNameUsed.trim(),
      selectedProducts,
    };
    window.localStorage.setItem(CHECKOUT_DRAFT_KEY, JSON.stringify(draft));
    window.localStorage.setItem(ADMIN_GOOGLE_SHORTCUT_KEY, '1');
    const redirectBaseUrl = resolveAuthRedirectBaseUrl();
    const returnPath = window.location.pathname;
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

  const selectedProduct = useMemo(() => {
    if (!selectedProductName) {
      return null;
    }

    return availableProducts.find((item) => item.name === selectedProductName) ?? null;
  }, [availableProducts, selectedProductName]);

  const filteredProducts = useMemo(() => {
    const query = productQuery.trim().toLowerCase();
    if (!query) {
      return availableProducts.slice(0, 50);
    }

    return availableProducts
      .filter((item) => item.name.toLowerCase().includes(query));
  }, [availableProducts, productQuery]);

  const totalAmount = useMemo(() => {
    return selectedProducts.reduce((sum, item) => sum + item.amount, 0);
  }, [selectedProducts]);

  const orderSummaryItems = useMemo(() => {
    const source = selectedProducts.length > 0 ? selectedProducts : lastSubmittedProducts;
    return source.map((item) => {
      const category = getProductCategory(item.name);
      return {
        ...item,
        category,
      };
    });
  }, [lastSubmittedProducts, selectedProducts]);

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const isEmailValid = emailPattern.test(email.trim());

  const canProceedFrom = (fromStage: FlowStage) => {
    if (fromStage === 1) {
      return username.trim().length > 0 && isEmailValid;
    }

    if (fromStage === 2) {
      return selectedProducts.length > 0;
    }

    if (fromStage === 3) {
      if (isVirtuMartSession) {
        return availedPortal === 'lazada' || availedPortal === 'shopee';
      }
      return true;
    }

    return true;
  };

  const stageErrorMessage: Record<FlowStage, string> = {
    1: 'Enter a valid username and email before proceeding to order.',
    2: 'Add at least one product before proceeding to payment portal.',
    3: isVirtuMartSession ? 'Select availed portal (Shopee or Lazada) before proceeding.' : 'Select a payment portal before proceeding to confirmation.',
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
    if (stage === 3) {
      if (isVirtuMartSession) {
        setPaymentPortalUsed(availedPortal || 'lazada');
      } else {
        setPaymentPortalUsed(selectedMethod);
      }
    }
    setStage((current) => (current < 4 ? ((current + 1) as FlowStage) : current));
  };

  const goToPreviousStage = () => {
    setSubmitError('');
    if (stage === 4 && isVirtuMartSession) {
      setStage(3);
      return;
    }
    setStage((current) => (current > 1 ? ((current - 1) as FlowStage) : current));
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthError = String(params.get('error') ?? '').trim();
    const oauthErrorCode = String(params.get('error_code') ?? '').trim();
    const rawDescription = String(params.get('error_description') ?? '').trim();
    if (!oauthError && !oauthErrorCode && !rawDescription) {
      return;
    }

    let readableDescription = 'Google sign-in failed. Please try again.';
    if (rawDescription) {
      try {
        readableDescription = decodeURIComponent(rawDescription.replace(/\+/g, ' '));
      } catch {
        readableDescription = rawDescription;
      }
    }

    window.localStorage.removeItem(ADMIN_GOOGLE_SHORTCUT_KEY);
    setAdminShortcutError(readableDescription);
    const cleanUrl = `${window.location.pathname}${window.location.hash || ''}`;
    window.history.replaceState({}, document.title, cleanUrl);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const payment = String(params.get('payment') ?? '').trim().toLowerCase();
    if (!payment) {
      return;
    }

    const serialFromQuery = String(params.get('serial') ?? '').trim().toUpperCase();
    const serialFromStorage = String(window.localStorage.getItem(PAYMONGO_SERIAL_KEY) ?? '').trim().toUpperCase();
    const resolvedSerial = serialFromQuery || serialFromStorage;

    if (resolvedSerial) {
      setConfirmedSerialNo(resolvedSerial);
    }

    if (payment === 'success') {
      setPaymentCompleted(true);
      setSubmitError('');
      setSubmitNotice('Payment confirmed. Your download access email has been sent.');
      setStage(4);
      window.localStorage.removeItem(CHECKOUT_DRAFT_KEY);
      window.localStorage.removeItem(PAYMONGO_SERIAL_KEY);
    } else if (payment === 'cancelled') {
      setPaymentCompleted(false);
      setSubmitError('Payment was cancelled. You can retry checkout anytime.');
      setStage(3);
    }

    const cleanUrl = `${window.location.pathname}`;
    window.history.replaceState({}, document.title, cleanUrl);
  }, []);

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
    const link = document.createElement('a');
    link.href = selectedQrSrc;
    link.download = selectedQrFilename;
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
      `Payment Portal: ${String(paymentPortalUsed).toUpperCase()}`,
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
  }, [orderSummaryItems, paymentPortalUsed, submitResult, totalAmount]);

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

  const removeSelectedProduct = (productName: string) => {
    setSelectedProducts((prev) => prev.filter((item) => item.name !== productName));
  };

  const handleSubmitVerification = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (selectedProducts.length === 0) {
      setSubmitError('Add at least one product before submitting.');
      return;
    }

    const paymentDetailUsed = paymentPortalUsed === 'gcash' ? gcashNumberUsed.trim() : gotymeAccountNameUsed.trim();
    if (!paymentDetailUsed) {
      setSubmitError(paymentPortalUsed === 'gcash' ? 'Enter the GCash number used for payment.' : 'Enter the GoTyme account name used for payment.');
      return;
    }

    const normalizedReferenceNo = referenceNo.replace(/\D/g, '').slice(-6);
    if (normalizedReferenceNo.length !== 6) {
      setSubmitError('Please enter the last 6 digits for reference no (sample: 123456).');
      return;
    }

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
      setPaymentPortalUsed(selectedMethod);
      setGcashNumberUsed('');
      setGotymeAccountNameUsed('');
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
    { id: 3, title: isVirtuMartSession ? 'Availed Portal' : 'Payment Portal', mobileTitle: isVirtuMartSession ? 'Portal' : 'Portal' },
    { id: 4, title: isVirtuMartSession ? 'Order Input' : 'Confirmation', mobileTitle: isVirtuMartSession ? 'Order' : 'Confirm' },
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
              key="stage-2-order"
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
                      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-cyan-200 drop-shadow-[0_0_9px_rgba(34,211,238,0.95)] animate-pulse" />
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
                      <ShoppingCart size={14} className="text-emerald-400 drop-shadow-[0_0_8px_rgba(74,222,128,0.9)]" />
                      Add to Cart
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
                    {isVirtuMartSession ? 'Next: Availed Portal' : 'Next: Payment Portal'} <ArrowRight size={15} />
                  </motion.button>
                </div>
              </CyberCard>
            </motion.div>
          ) : stage === 1 ? (
            <motion.div
              key="stage-1-client"
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

                {isAllowedAdminEmail(email) && isGoogleVerified ? (
                  <div className="mt-6 rounded-xl border border-yellow-400/30 bg-yellow-500/5 p-4">
                    <p className="text-center text-[11px] font-mono uppercase tracking-[0.2em] text-yellow-200">
                      Admin account recognized. This checkout stays on buyer flow.
                    </p>
                  </div>
                ) : null}

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
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
            >
              {isVirtuMartSession ? (
                <CyberCard title="Availed Portal" icon={ShieldCheck} color="cyan">
                  <div className="space-y-5">
                    <p className="text-center text-cyan-100 text-sm">Select where this order was availed before proceeding.</p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => setAvailedPortal('lazada')}
                        className={`rounded-lg border px-4 py-4 text-left transition ${availedPortal === 'lazada' ? 'border-orange-400 bg-orange-500/15 text-orange-100 shadow-[0_0_20px_rgba(251,146,60,0.25)]' : 'border-white/20 bg-black/25 text-gray-300 hover:border-orange-300/70'}`}
                      >
                        <p className="text-xs font-mono uppercase tracking-[0.2em]">Lazada</p>
                        <p className="mt-1 text-[11px] text-orange-200/85">Numeric order id</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => setAvailedPortal('shopee')}
                        className={`rounded-lg border px-4 py-4 text-left transition ${availedPortal === 'shopee' ? 'border-red-400 bg-red-500/15 text-red-100 shadow-[0_0_20px_rgba(248,113,113,0.25)]' : 'border-white/20 bg-black/25 text-gray-300 hover:border-red-300/70'}`}
                      >
                        <p className="text-xs font-mono uppercase tracking-[0.2em]">Shopee</p>
                        <p className="mt-1 text-[11px] text-red-200/85">Starts with # + alphanumeric</p>
                      </button>
                    </div>
                    <div className="flex flex-col sm:flex-row justify-center gap-3">
                      <motion.button type="button" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={goToPreviousStage} className="cyber-btn cyber-btn-secondary">
                        <ArrowLeft size={15} /> Back
                      </motion.button>
                      <motion.button type="button" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={goToNextStage} className="cyber-btn cyber-btn-primary">
                        Next: Order Input <ArrowRight size={15} />
                      </motion.button>
                    </div>
                  </div>
                </CyberCard>
              ) : (
                <CyberCard title="Automated Checkout" icon={ShieldCheck} color="cyan">
                  <div className="text-center p-6 space-y-4">
                    <p className="text-cyan-100 text-sm">You will be redirected to our secure PayMongo checkout portal to complete your payment.</p>
                    <div className="relative mx-auto w-full max-w-xs rounded-xl overflow-hidden border border-cyan-500/30 shadow-[0_0_30px_rgba(0,243,255,0.15)]">
                      <div className="bg-gradient-to-br from-[#0a2540] to-[#0d3a6c] p-6 flex flex-col items-center gap-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-[#02a6e4] flex items-center justify-center text-white font-black text-sm">P</div>
                          <span className="text-white font-black text-xl tracking-tight">PayMongo</span>
                        </div>
                        <p className="text-[#7ecff5] text-xs font-mono uppercase tracking-widest">Secure Payment Gateway</p>
                        <div className="flex gap-2 mt-1 flex-wrap justify-center">
                          {['GCash', 'Maya', 'GoTyme', 'Cards'].map((m) => (
                            <span key={m} className="rounded-full border border-[#02a6e4]/40 bg-[#02a6e4]/10 px-3 py-1 text-[10px] font-mono uppercase tracking-wider text-[#7ecff5]">{m}</span>
                          ))}
                        </div>
                      </div>
                      <div className="bg-black/60 px-4 py-2 flex items-center justify-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${isRadTestSession ? 'bg-amber-300' : 'bg-green-400'} animate-pulse`} />
                        <span className={`text-[10px] font-mono uppercase tracking-widest ${isRadTestSession ? 'text-amber-300' : 'text-green-400'}`}>
                          {isRadTestSession ? 'Test Mode' : 'Live & Secure'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row justify-center gap-3">
                    <motion.button type="button" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={goToPreviousStage} className="cyber-btn cyber-btn-secondary">
                      <ArrowLeft size={15} /> Back
                    </motion.button>
                    <motion.button
                      type="button"
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={async () => {
                        setIsSubmitting(true);
                        setSubmitError('');
                        const isAdminTestCheckout = isRadTestSession;
                        const isFreebie = totalAmount === 0;

                        try {
                          if (isFreebie) {
                            const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/claim-freebie`, {
                              method: 'POST',
                              headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
                              },
                              body: JSON.stringify({
                                username,
                                email,
                                products: selectedProducts.map((p) => ({
                                  id: p.id,
                                  name: p.name,
                                  amount: p.amount
                                })),
                                totalAmount: 0,
                                reference_no: `FREE-${Date.now().toString().slice(-6)}`
                              })
                            });

                            const data = await response.json();
                            if (response.ok) {
                              setPaymentCompleted(true);
                              setSubmitNotice('Freebie claim is complete. Check your email for delivery details.');
                              setStage(4);
                            } else {
                              throw new Error(data.error || 'Failed to claim freebie');
                            }
                          } else {
                            const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://jfdvbyoyvqriqhqtmyjo.supabase.co';
                            const response = await fetch(`${SUPABASE_URL}/functions/v1/create-checkout`, {
                              method: 'POST',
                              headers: {
                                'Content-Type': 'application/json',
                              },
                              body: JSON.stringify({
                                amount: totalAmount,
                                description: selectedProducts.map((p) => p.name).join(', '),
                                email,
                                name: username,
                                useTestMode: isAdminTestCheckout,
                                products: selectedProducts,
                                returnUrl: window.location.origin,
                                metadata: {
                                  is_admin_test: String(isAdminTestCheckout)
                                }
                              })
                            });
                            const data = await response.json();
                            if (data.checkout_url) {
                              const resolvedSerial = String(data.serial_no ?? data.serialNo ?? '').trim().toUpperCase();
                              if (resolvedSerial) {
                                setConfirmedSerialNo(resolvedSerial);
                                window.localStorage.setItem(PAYMONGO_SERIAL_KEY, resolvedSerial);
                              }
                              window.location.href = data.checkout_url;
                            } else {
                              throw new Error(data.error || 'Failed to create checkout session');
                            }
                          }
                        } catch (err: any) {
                          setSubmitError(err.message);
                          setIsSubmitting(false);
                        }
                      }}
                      className="cyber-btn cyber-btn-primary"
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? 'Processing...' : totalAmount === 0 ? 'Claim for Free' : isRadTestSession ? 'Pay with PayMongo (Test)' : 'Pay with PayMongo'} <ArrowRight size={15} />
                    </motion.button>
                  </div>
                </CyberCard>
              )}
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
              <CyberCard title={isVirtuMartSession && !paymentCompleted ? 'Order Input' : 'Confirmation'} icon={ShieldCheck} color="magenta">
                <div className="space-y-4 rounded-xl border border-cyan-500/40 bg-[#031018]/80 p-5 shadow-[0_0_30px_rgba(0,195,255,0.1)]">
                  {isVirtuMartSession && !paymentCompleted ? (
                    <>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="rounded-md border border-cyan-500/30 bg-black/35 px-4 py-3">
                          <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-cyan-300">Availed Portal</p>
                          <p className="mt-1 text-sm font-black uppercase tracking-[0.12em] text-cyan-100">{availedPortal || 'Not selected'}</p>
                        </div>
                        <div className="rounded-md border border-cyan-500/30 bg-black/35 px-4 py-3">
                          <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-cyan-300">Total Amount</p>
                          <p className="mt-1 text-sm font-black uppercase tracking-[0.12em] text-cyan-100">PHP {totalAmount}</p>
                        </div>
                      </div>

                      <label className="block">
                        <span className="mb-2 block text-[11px] font-mono uppercase tracking-[0.25em] text-cyan-300">Order Reference</span>
                        <input
                          value={orderReferenceInput}
                          onChange={(event) => {
                            if (availedPortal === 'lazada') {
                              setOrderReferenceInput(event.target.value.replace(/\D/g, ''));
                              return;
                            }
                            setOrderReferenceInput(event.target.value.toUpperCase());
                          }}
                          className="w-full rounded-md border border-cyan-500/50 bg-black/50 px-4 py-3 text-sm text-gray-100 outline-none transition focus:border-cyan-300 focus:shadow-[0_0_18px_rgba(0,255,255,0.2)]"
                          placeholder={availedPortal === 'lazada' ? 'e.g. 1084119160670021' : 'e.g. #260202MKQC1CBY'}
                        />
                        <span className="mt-2 block text-[10px] font-mono uppercase tracking-[0.18em] text-cyan-200/80">
                          {availedPortal === 'lazada' ? 'Lazada format: numbers only' : 'Shopee format: # + letters and numbers'}
                        </span>
                      </label>

                      <div className="flex flex-col sm:flex-row gap-3 justify-between">
                        <motion.button type="button" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={goToPreviousStage} className="cyber-btn cyber-btn-secondary">
                          <ArrowLeft size={15} /> Back
                        </motion.button>
                        <motion.button
                          type="button"
                          whileHover={{ scale: 1.03 }}
                          whileTap={{ scale: 0.97 }}
                          disabled={isSubmitting}
                          onClick={async () => {
                            if (!availedPortal) {
                              setSubmitError('Select availed portal first.');
                              return;
                            }
                            if (!isVirtuMartOrderRefValid) {
                              setSubmitError(availedPortal === 'lazada' ? 'Enter a valid Lazada order id (numbers only).' : 'Enter a valid Shopee order reference (example: #260202MKQC1CBY).');
                              return;
                            }

                            setIsSubmitting(true);
                            setSubmitError('');
                            setSubmitNotice('');

                            try {
                              const response = await fetch('/api/virtumart-submit', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  username,
                                  email,
                                  products: selectedProducts,
                                  totalAmount,
                                  availedPortal,
                                  orderReference: normalizedVirtuMartOrderRef,
                                }),
                              });
                              const data = await response.json();
                              if (!response.ok || !data.ok) {
                                throw new Error(data.error || 'VirtuMart order submission failed.');
                              }

                              const serial = String(data.serialNo ?? '').trim().toUpperCase();
                              setConfirmedSerialNo(serial);
                              setPaymentCompleted(true);
                              setPaymentPortalUsed(availedPortal);
                              setOrderReferenceInput(normalizedVirtuMartOrderRef);
                              setSubmitNotice('Order auto-approved. Delivery email was sent to the client.');
                            } catch (error: any) {
                              setSubmitError(String(error?.message ?? 'Submission failed.'));
                            } finally {
                              setIsSubmitting(false);
                            }
                          }}
                          className="cyber-btn cyber-btn-primary"
                        >
                          {isSubmitting ? 'Submitting...' : 'Submit Order'} <ArrowRight size={15} />
                        </motion.button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="rounded-md border border-cyan-500/35 bg-black/35 px-4 py-3">
                        <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-cyan-300">Order Serial</p>
                        <p className="mt-1 text-xl font-black tracking-wider text-cyan-100">{confirmedSerialNo || submitResult?.serialNo || 'PENDING-SERIAL'}</p>
                      </div>

                      <div className={`rounded-md border px-4 py-3 text-sm font-mono uppercase tracking-[0.12em] ${paymentCompleted ? 'border-emerald-400/45 bg-emerald-500/10 text-emerald-200' : 'border-amber-400/45 bg-amber-500/10 text-amber-200'}`}>
                        {paymentCompleted ? 'Payment successful. Delivery email sent.' : 'Awaiting payment confirmation.'}
                      </div>

                      {isVirtuMartSession ? (
                        <div className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-xs font-mono uppercase tracking-[0.12em] text-cyan-200">
                          Portal: {String(paymentPortalUsed).toUpperCase()} | Reference: {orderReferenceInput || normalizedVirtuMartOrderRef || 'N/A'}
                        </div>
                      ) : null}

                      {submitNotice ? (
                        <div className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-xs font-mono uppercase tracking-[0.12em] text-cyan-200">
                          {submitNotice}
                        </div>
                      ) : null}

                      {submitError ? (
                        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs font-mono uppercase tracking-[0.15em] text-red-300">
                          {submitError}
                        </div>
                      ) : null}

                      <div className="flex flex-col sm:flex-row gap-3 justify-between">
                        <motion.button type="button" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={goToPreviousStage} className="cyber-btn cyber-btn-secondary">
                          <ArrowLeft size={15} /> Back
                        </motion.button>
                        <motion.button type="button" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={goToHome} className="cyber-btn cyber-btn-secondary">
                          <Home size={15} /> Home
                        </motion.button>
                      </div>
                    </>
                  )}
                </div>
              </CyberCard>
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
      </main >
    </div >
  );
}
