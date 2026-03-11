import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { motion } from 'motion/react';
import { Archive, ArrowLeft, BarChart3, CheckCircle2, Download, Inbox, PackageSearch, Pencil, ShieldAlert, Trash2, Upload, UsersRound, Plus, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { productCatalog } from './data/products';
import { getSupabaseBrowserClient } from './lib/supabase-browser';

type AdminProduct = {
  id: string;
  name: string;
  amount: number;
  os: string;
  fileLink: string;
  category: string;
  sub_category: string;
  image_url: string;
};

type InboxItem = {
  id: string;
  buyerName: string;
  buyerEmail: string;
  referenceCode: string;
  submittedAt: string;
  products: string[];
  status: 'pending' | 'approved' | 'rejected';
  deliveryLink: string;
  paymentPortalUsed?: string;
  paymentDetailUsed?: string;
  totalDownloads?: number;
  entitlementUsed?: number;
  entitlementLimit?: number;
  entitlementUnlimited?: boolean;
  deliveryLinksByProduct?: Record<string, string>;
};

const PRODUCTS_KEY = 'dmerch_admin_products_v1';
const INBOX_KEY = 'dmerch_admin_inbox_v1';
const COUNTERS_RESET_DAY_KEY = 'dmerch_counters_reset_day_v1';
const ALLOWED_ADMIN_EMAILS = new Set(['digitalmerch4862@gmail.com']);

const isAllowedAdminEmail = (value: string | null | undefined) => {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized.length > 0 && ALLOWED_ADMIN_EMAILS.has(normalized);
};

const resolveAuthRedirectBaseUrl = () => {
  return window.location.origin.replace(/\/+$/, '');
};

const inferOs = (name: string) => {
  const lower = name.toLowerCase();
  if (lower.includes('windows')) return 'Windows';
  if (lower.includes('mac')) return 'macOS';
  if (lower.includes('android') || lower.includes('.apk')) return 'Android';
  return 'Multi';
};

const normalizeProductName = (value: string) => value
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const parseStoredProducts = (raw: string | null): AdminProduct[] => {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map((item, index) => ({
      id: String((item as any)?.id ?? `stored-${index}`),
      name: String((item as any)?.name ?? '').trim(),
      amount: Number((item as any)?.amount ?? 0),
      os: String((item as any)?.os ?? '').trim() || inferOs(String((item as any)?.name ?? '')),
      fileLink: String((item as any)?.fileLink ?? '').trim(),
      category: String((item as any)?.category ?? 'Software').trim(),
      sub_category: String((item as any)?.sub_category ?? 'General').trim(),
      image_url: String((item as any)?.image_url ?? '').trim(),
    })).filter((item) => item.name.length > 0 && Number.isFinite(item.amount));
  } catch {
    return [];
  }
};

const toSeedProducts = (): AdminProduct[] => {
  return productCatalog.slice(0, 120).map((item, index) => ({
    id: `seed-${index + 1}`,
    name: item.name,
    amount: item.amount,
    os: inferOs(item.name),
    fileLink: '',
    category: item.category || 'Software',
    sub_category: item.sub_category || 'General',
    image_url: '',
  }));
};

const parseBulkRows = (raw: string): AdminProduct[] => {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const imported: AdminProduct[] = [];
  for (const line of lines) {
    // Try to split by tab, then common space-delimiters/commas
    // Regex: split by tab OR 2+ spaces OR comma
    let parts = line.split(/\t| {2,}|,/);

    // Fallback: if only one part found, maybe it's single-space separated?
    if (parts.length < 2) {
      parts = line.split(' ');
    }

    if (parts.length < 2) {
      continue;
    }

    const name = String(parts[0] ?? '').trim();
    const fileLink = String(parts[1] ?? '').trim();
    const category = String(parts[2] ?? 'Software').trim();
    const sub_category = String(parts[3] ?? 'General').trim();
    const amountStr = String(parts[4] ?? '').trim();
    const amount = amountStr ? Number(amountStr) : 99;
    const os = inferOs(name);

    if (!name || Number.isNaN(amount)) {
      continue;
    }

    imported.push({
      id: `import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      amount,
      os,
      fileLink,
      category,
      sub_category,
      image_url: '',
    });
  }

  return imported;
};

type InboxApiItem = Omit<InboxItem, 'id' | 'deliveryLink'>;

type CrmItem = {
  id: string;
  referenceCode: string;
  buyerName: string;
  buyerEmail: string;
  submittedAt: string;
  products: string[];
  totalAmount: number;
  status: 'pending' | 'approved' | 'rejected';
};

type CrmApiItem = Omit<CrmItem, 'id'>;

type AdminTab = 'analytics' | 'approvals' | 'products' | 'crm' | 'manualEncode';

const toPhp = (amount: number) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);

const startOfWeek = (date: Date) => {
  const clone = new Date(date);
  const day = clone.getDay();
  const diffToMonday = (day + 6) % 7;
  clone.setDate(clone.getDate() - diffToMonday);
  clone.setHours(0, 0, 0, 0);
  return clone;
};

const startOfMonth = (date: Date) => {
  const clone = new Date(date);
  clone.setDate(1);
  clone.setHours(0, 0, 0, 0);
  return clone;
};

const startOfQuarter = (date: Date) => {
  const clone = new Date(date);
  const quarterStartMonth = Math.floor(clone.getMonth() / 3) * 3;
  clone.setMonth(quarterStartMonth, 1);
  clone.setHours(0, 0, 0, 0);
  return clone;
};

const startOfYear = (date: Date) => {
  const clone = new Date(date);
  clone.setMonth(0, 1);
  clone.setHours(0, 0, 0, 0);
  return clone;
};

const subtractDays = (date: Date, days: number) => {
  const clone = new Date(date);
  clone.setDate(clone.getDate() - days);
  return clone;
};

const subtractMonths = (date: Date, months: number) => {
  const clone = new Date(date);
  clone.setMonth(clone.getMonth() - months);
  return clone;
};

const subtractYears = (date: Date, years: number) => {
  const clone = new Date(date);
  clone.setFullYear(clone.getFullYear() - years);
  return clone;
};

const toReadableDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'N/A';
  }
  return date.toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

const toManilaDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'N/A';
  }

  return date.toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

const toWaitingDuration = (submittedAt: string, nowMs: number) => {
  const submittedMs = new Date(submittedAt).getTime();
  if (Number.isNaN(submittedMs)) {
    return 'N/A';
  }

  const diffMs = Math.max(0, nowMs - submittedMs);
  const totalMinutes = Math.floor(diffMs / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
};

const toManilaDayKey = (value: string | Date) => {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
};

export default function Admin() {
  const [loginError, setLoginError] = useState('');
  const [authChecking, setAuthChecking] = useState(true);
  const [unlocked, setUnlocked] = useState(false);
  const [accessToken, setAccessToken] = useState('');

  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [inboxItems, setInboxItems] = useState<InboxItem[]>([]);
  const [crmItems, setCrmItems] = useState<CrmItem[]>([]);
  const [bulkData, setBulkData] = useState('');
  const [search, setSearch] = useState('');
  const [searchScope, setSearchScope] = useState<'all' | 'name' | 'category' | 'subcategory' | 'amount'>('all');
  const [crmSearch, setCrmSearch] = useState('');
  const [crmStatusFilter, setCrmStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [expandedCrmUser, setExpandedCrmUser] = useState<string | null>(null);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [massAmount, setMassAmount] = useState('');
  const [massCategory, setMassCategory] = useState('');
  const [inboxLoading, setInboxLoading] = useState(false);
  const [crmLoading, setCrmLoading] = useState(false);
  const [inboxError, setInboxError] = useState('');
  const [crmError, setCrmError] = useState('');
  const [lastInboxSyncAt, setLastInboxSyncAt] = useState('');
  const [lastCrmSyncAt, setLastCrmSyncAt] = useState('');
  const [inboxLastCount, setInboxLastCount] = useState(0);
  const [crmLastCount, setCrmLastCount] = useState(0);
  const [activeTab, setActiveTab] = useState<AdminTab>('analytics');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const inboxAutoMappedRef = useRef(false);
  const [counterResetDayKey, setCounterResetDayKey] = useState('');
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [selectedCrmRecordId, setSelectedCrmRecordId] = useState<string | null>(null);
  const [crmEditorOpen, setCrmEditorOpen] = useState(false);
  const [crmEditName, setCrmEditName] = useState('');
  const [crmEditEmail, setCrmEditEmail] = useState('');
  const [crmEditProducts, setCrmEditProducts] = useState('');
  const [crmEditAmount, setCrmEditAmount] = useState('');
  const [analyticsPeriod, setAnalyticsPeriod] = useState<'week' | 'month' | 'quarter' | 'year'>('week');
  const [isDragSelecting, setIsDragSelecting] = useState(false);
  const [dragSelectMode, setDragSelectMode] = useState<'select' | 'deselect'>('select');
  const [crmBulkData, setCrmBulkData] = useState('');
  const [crmBulkStatus, setCrmBulkStatus] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualEmail, setManualEmail] = useState('');
  const [manualProducts, setManualProducts] = useState('');
  const [manualAmount, setManualAmount] = useState('');
  const [manualProductSearch, setManualProductSearch] = useState('');
  const [selectedManualProducts, setSelectedManualProducts] = useState<string[]>([]);
  const [manualDropdownOpen, setManualDropdownOpen] = useState(false);
  const [productsPage, setProductsPage] = useState(1);
  const [productsPerPage, setProductsPerPage] = useState(50);
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [manualError, setManualError] = useState('');
  const [manualSuccess, setManualSuccess] = useState('');
  const [isManualEncodeExpanded, setIsManualEncodeExpanded] = useState(false);
  const crmFileInputRef = useRef<HTMLInputElement>(null);

  const fetchSupabaseProducts = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    let allProducts: any[] = [];
    let pageNum = 0;
    const PAGE_SIZE = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('name', { ascending: true })
        .order('id', { ascending: true })
        .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1);

      if (error) {
        console.error('[Admin] Error fetching products:', error);
        hasMore = false;
      } else if (data && data.length > 0) {
        allProducts = [...allProducts, ...data];
        if (data.length < PAGE_SIZE) {
          hasMore = false;
        } else {
          pageNum++;
        }
      } else {
        hasMore = false;
      }
    }

    if (allProducts.length > 0) {
      setProducts(allProducts.map(p => ({
        id: p.id,
        name: p.name,
        amount: Number(p.price || 0),
        os: p.os || inferOs(p.name),
        fileLink: p.file_url || '',
        category: p.category || 'Software',
        sub_category: p.sub_category || 'General',
        image_url: p.image_url || '',
      })));
    }
  }, []);

  const readApiPayload = async (response: Response) => {
    try {
      return (await response.json()) as Record<string, unknown>;
    } catch {
      return {};
    }
  };

  const logoutForAuthFailure = async (message: string) => {
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
    inboxAutoMappedRef.current = false;
    setAccessToken('');
    setUnlocked(false);
    setInboxItems([]);
    setCrmItems([]);
    setInboxError('');
    setCrmError('');
    setLoginError(message);
  };

  useEffect(() => {
    const storedInbox = window.localStorage.getItem(INBOX_KEY);

    if (storedInbox) {
      setInboxItems(JSON.parse(storedInbox) as InboxItem[]);
    } else {
      setInboxItems([]);
      window.localStorage.setItem(INBOX_KEY, JSON.stringify([]));
    }

    setCounterResetDayKey(String(window.localStorage.getItem(COUNTERS_RESET_DAY_KEY) ?? '').trim());

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setLoginError('Missing Supabase browser credentials. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
      setAuthChecking(false);
      return;
    }

    const applySession = async (session: { access_token?: string; user?: { email?: string | null } } | null | undefined) => {
      const token = session?.access_token ?? '';
      if (!token) {
        setAccessToken('');
        setUnlocked(false);
        setAuthChecking(false);
        return;
      }

      const sessionEmail = session?.user?.email;
      if (!isAllowedAdminEmail(sessionEmail)) {
        await supabase.auth.signOut();
        setAccessToken('');
        setUnlocked(false);
        setLoginError('This Google account is not allowed for admin access.');
        setAuthChecking(false);
        return;
      }

      setAccessToken(token);
      setUnlocked(true);
      setLoginError('');
      setAuthChecking(false);
      void fetchSupabaseProducts();
    };

    void supabase.auth.getSession().then(({ data }) => {
      void applySession(data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      void applySession(session);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!unlocked) {
      return;
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      return;
    }

    const channel = supabase
      .channel('admin-products')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
        void fetchSupabaseProducts();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchSupabaseProducts, unlocked]);

  // No longer using LocalStorage for products
  // useEffect(() => {
  //   window.localStorage.setItem(PRODUCTS_KEY, JSON.stringify(products));
  // }, [products]);

  useEffect(() => {
    window.localStorage.setItem(INBOX_KEY, JSON.stringify(inboxItems));
  }, [inboxItems]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 60000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    setProductsPage(1);
  }, [search]);

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    const amountQuery = massAmount.trim();
    const categoryQuery = massCategory.trim().toLowerCase();

    return products.filter((item) => {
      if (query) {
        const name = String(item.name ?? '').toLowerCase();
        const category = String(item.category ?? '').toLowerCase();
        const subCategory = String(item.sub_category ?? '').toLowerCase();
        const amountValue = String(item.amount ?? '').toLowerCase();
        let searchTarget = name;

        if (searchScope === 'all') {
          searchTarget = `${name} ${category} ${subCategory} ${amountValue}`;
        } else if (searchScope === 'category') {
          searchTarget = category;
        } else if (searchScope === 'subcategory') {
          searchTarget = subCategory;
        } else if (searchScope === 'amount') {
          searchTarget = amountValue;
        }

        if (!searchTarget.includes(query)) {
          return false;
        }
      }

      if (amountQuery && !String(item.amount ?? '').includes(amountQuery)) {
        return false;
      }

      if (categoryQuery && !String(item.category ?? '').toLowerCase().includes(categoryQuery)) {
        return false;
      }

      return true;
    });
  }, [products, search, massAmount, massCategory]);

  const selectedCount = selectedProductIds.length;
  const selectedIdsSet = useMemo(() => new Set(selectedProductIds), [selectedProductIds]);

  const areAllProductsSelected = useMemo(() => {
    if (products.length === 0 || selectedProductIds.length < products.length) return false;
    return products.every((item) => selectedIdsSet.has(item.id));
  }, [products, selectedIdsSet]);

  const refreshInbox = async (tokenOverride?: string) => {
    const token = tokenOverride ?? accessToken;
    if (!token) {
      return;
    }

    setInboxLoading(true);
    setInboxError('');
    try {
      const response = await fetch('/api/admin-inbox', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const payload = (await readApiPayload(response)) as { ok?: boolean; inbox?: InboxApiItem[]; error?: string };

      if (response.status === 401 || response.status === 403) {
        const reason = payload.error ?? (response.status === 401 ? 'Admin session expired.' : 'Admin role required.');
        await logoutForAuthFailure(reason);
        return;
      }

      if (!response.ok || !payload.ok || !payload.inbox) {
        throw new Error(payload.error ?? `Inbox sync failed (${response.status}).`);
      }

      const localProducts = parseStoredProducts(window.localStorage.getItem(PRODUCTS_KEY));
      const productLinkMap = new Map<string, string>();
      for (const product of [...products, ...localProducts]) {
        const key = normalizeProductName(product.name);
        const link = String(product.fileLink ?? '').trim();
        if (key && link && !productLinkMap.has(key)) {
          productLinkMap.set(key, link);
        }
      }

      setInboxItems(
        payload.inbox.map((item) => {
          const deliveryLinksByProduct: Record<string, string> = {};
          for (const name of item.products) {
            const matched = productLinkMap.get(normalizeProductName(name)) ?? '';
            if (matched) {
              deliveryLinksByProduct[name] = matched;
            }
          }

          const firstMatchedLink = item.products
            .map((name) => deliveryLinksByProduct[name] ?? '')
            .find((link) => Boolean(link)) ?? '';

          return {
            ...item,
            id: item.referenceCode,
            deliveryLink: firstMatchedLink,
            deliveryLinksByProduct,
          };
        }),
      );
      setInboxLastCount(payload.inbox.length);
      setLastInboxSyncAt(new Date().toISOString());
      setLoginError('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not load inbox';
      setInboxError(message);
      setLoginError(message);
    } finally {
      setInboxLoading(false);
    }
  };

  const refreshCrm = async (tokenOverride?: string) => {
    const token = tokenOverride ?? accessToken;
    if (!token) {
      return;
    }

    setCrmLoading(true);
    setCrmError('');
    try {
      const response = await fetch('/api/admin-crm', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const payload = (await readApiPayload(response)) as { ok?: boolean; rows?: CrmApiItem[]; error?: string };

      if (response.status === 401 || response.status === 403) {
        const reason = payload.error ?? (response.status === 401 ? 'Admin session expired.' : 'Admin role required.');
        await logoutForAuthFailure(reason);
        return;
      }

      if (!response.ok || !payload.ok || !payload.rows) {
        throw new Error(payload.error ?? `CRM sync failed (${response.status}).`);
      }

      setCrmItems(payload.rows.map((item) => ({ ...item, id: item.referenceCode })));
      setCrmLastCount(payload.rows.length);
      setLastCrmSyncAt(new Date().toISOString());
      setLoginError('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not load CRM records';
      setCrmError(message);
      setLoginError(message);
    } finally {
      setCrmLoading(false);
    }
  };

  const refreshAdminData = async () => {
    await Promise.all([refreshInbox(), refreshCrm()]);
  };

  useEffect(() => {
    if (!unlocked || !accessToken) {
      inboxAutoMappedRef.current = false;
      return;
    }
    void refreshInbox(accessToken);
    void refreshCrm(accessToken);
  }, [unlocked, accessToken]);

  useEffect(() => {
    if (!unlocked || !accessToken || inboxAutoMappedRef.current) {
      return;
    }

    const hasAnyLinkedProduct = products.some((item) => String(item.fileLink ?? '').trim().length > 0);
    if (!hasAnyLinkedProduct) {
      return;
    }

    inboxAutoMappedRef.current = true;
    void refreshInbox(accessToken);
  }, [products, unlocked, accessToken]);

  const handleGoogleLogin = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setLoginError('Supabase browser auth is not configured.');
      return;
    }

    setLoginError('');
    const redirectBaseUrl = resolveAuthRedirectBaseUrl();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${redirectBaseUrl}/admin`,
      },
    });

    if (error) {
      setLoginError(error?.message ?? 'Unable to sign in.');
    }
  };

  const updateProduct = async (id: string, patch: Partial<AdminProduct>) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setProducts((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));

    const updateMap: any = {};
    if (patch.name !== undefined) updateMap.name = patch.name;
    if (patch.amount !== undefined) updateMap.price = patch.amount;
    if (patch.os !== undefined) updateMap.os = patch.os;
    if (patch.fileLink !== undefined) updateMap.file_url = patch.fileLink;
    if (patch.category !== undefined) updateMap.category = patch.category;
    if (patch.sub_category !== undefined) updateMap.sub_category = patch.sub_category;
    if (patch.image_url !== undefined) updateMap.image_url = patch.image_url;

    if (Object.keys(updateMap).length > 0) {
      await supabase.from('products').update(updateMap).eq('id', id);
    }
  };

  const removeProduct = async (id: string) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    if (!window.confirm('Delete this product?')) {
      return;
    }

    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) {
      alert(`Error deleting product: ${error.message}`);
      return;
    }

    setProducts((current) => current.filter((item) => item.id !== id));
    setSelectedProductIds((current) => current.filter((itemId) => itemId !== id));
  };

  const addProductRow = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const newProduct = {
      name: 'New Product',
      price: 99,
      price_usd: 1.00,
      os: 'Windows',
      file_url: '',
      category: 'Software',
      sub_category: 'General',
    };

    const { data, error } = await supabase.from('products').insert(newProduct).select().single();
    if (error) {
      alert(`Error adding product: ${error.message}`);
      return;
    }

    if (data) {
      setProducts((current) => [
        {
          id: data.id,
          name: data.name,
          amount: Number(data.price || 0),
          os: data.os || 'Windows',
          fileLink: data.file_url || '',
          category: data.category || 'Software',
          sub_category: data.sub_category || 'General',
          image_url: data.image_url || '',
        },
        ...current,
      ]);
    }
  };

  const migrateProductsToSupabase = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const localProducts = parseStoredProducts(window.localStorage.getItem(PRODUCTS_KEY));
    if (localProducts.length === 0) {
      alert('No local products found to migrate.');
      return;
    }

    if (!window.confirm(`Migrate ${localProducts.length} products to Supabase?`)) {
      return;
    }

    const toInsert = localProducts.map(p => ({
      name: p.name,
      price: p.amount,
      price_usd: Math.max(1.00, Number((p.amount / 50).toFixed(2))),
      os: p.os,
      file_url: p.fileLink,
      category: p.category,
      sub_category: p.sub_category,
    }));

    const { error } = await supabase.from('products').insert(toInsert);
    if (error) {
      alert(`Migration error: ${error.message}`);
    } else {
      alert('Migration successful!');
      window.localStorage.removeItem(PRODUCTS_KEY);
      // Refresh
      const { data } = await supabase.from('products').select('*').order('name');
      if (data) {
        setProducts(data.map(p => ({
          id: p.id,
          name: p.name,
          amount: Number(p.price || 0),
          os: p.os || inferOs(p.name),
          fileLink: p.file_url || '',
          category: p.category || 'Software',
          sub_category: p.sub_category || 'General',
        })));
      }
    }
  };

  const applyBulkImport = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const imported = parseBulkRows(bulkData);
    if (imported.length === 0) {
      return;
    }

    const toInsert = imported.map(p => ({
      name: p.name,
      price: p.amount,
      price_usd: Math.max(1.00, Number((p.amount / 50).toFixed(2))),
      os: p.os,
      file_url: p.fileLink,
      category: p.category,
      sub_category: p.sub_category,
    }));

    const { error } = await supabase.from('products').insert(toInsert);
    if (error) {
      alert(`Import error: ${error.message}`);
    } else {
      setBulkData('');
      // Refresh
      const { data } = await supabase.from('products').select('*').order('name');
      if (data) {
        setProducts(data.map(p => ({
          id: p.id,
          name: p.name,
          amount: Number(p.price || 0),
          os: p.os || inferOs(p.name),
          fileLink: p.file_url || '',
          category: p.category || 'Software',
          sub_category: p.sub_category || 'General',
        })));
      }
      alert('Successfully imported products!');
    }
  };

  const updateInbox = (id: string, patch: Partial<InboxItem>) => {
    setInboxItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const toggleSelectProduct = (id: string) => {
    setSelectedProductIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const applyDragSelection = (id: string, mode: 'select' | 'deselect') => {
    setSelectedProductIds((current) => {
      if (mode === 'select') {
        return current.includes(id) ? current : [...current, id];
      }
      return current.filter((item) => item !== id);
    });
  };

  const startDragSelect = (id: string) => {
    const isSelected = selectedProductIds.includes(id);
    const mode: 'select' | 'deselect' = isSelected ? 'deselect' : 'select';
    setDragSelectMode(mode);
    setIsDragSelecting(true);
    applyDragSelection(id, mode);
  };

  const handleDragEnter = (id: string) => {
    if (!isDragSelecting) return;
    applyDragSelection(id, dragSelectMode);
  };

  const selectAllProducts = () => {
    // Select all FILTERED products for better UX
    const allIds = filteredProducts.map((item) => item.id);
    setSelectedProductIds(allIds);
  };

  const selectAllOnPage = () => {
    const startIndex = (productsPage - 1) * productsPerPage;
    const pageIds = filteredProducts.slice(startIndex, startIndex + productsPerPage).map(p => p.id);
    setSelectedProductIds(prev => Array.from(new Set([...prev, ...pageIds])));
  };

  const clearSelectedProducts = () => {
    setSelectedProductIds([]);
  };

  useEffect(() => {
    const handleMouseUp = () => setIsDragSelecting(false);
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, []);

  const applyMassAmount = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const parsed = Number(massAmount);
    if (Number.isNaN(parsed)) {
      return;
    }
    
    const { error } = await supabase.from('products').update({ price: parsed }).in('id', selectedProductIds);
    if (error) {
      alert(`Error updating products: ${error.message}`);
      return;
    }

    setProducts((current) => current.map((item) => (selectedProductIds.includes(item.id) ? { ...item, amount: parsed } : item)));
    setMassAmount('');
  };

  const applyMassCategory = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const nextCategory = massCategory.trim();
    if (!nextCategory) {
      return;
    }
    
    const { error } = await supabase.from('products').update({ category: nextCategory }).in('id', selectedProductIds);
    if (error) {
      alert(`Error updating products: ${error.message}`);
      return;
    }

    setProducts((current) => current.map((item) => (selectedProductIds.includes(item.id) ? { ...item, category: nextCategory } : item)));
    setMassCategory('');
  };

  const exportProductsCsv = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const { data, error } = await supabase
      .from('products')
      .select('name, price, price_usd, os, file_url, category, sub_category')
      .order('name');

    if (error || !data) {
      alert(`Export error: ${error?.message ?? 'Unable to export products.'}`);
      return;
    }

    const header = 'Name,Price,Price USD,OS,File Link,Category,Sub Category\n';
    const rows = data.map((item) => {
      const name = String(item.name ?? '').replace(/"/g, '""');
      const fileLink = String(item.file_url ?? '').replace(/"/g, '""');
      const category = String(item.category ?? '').replace(/"/g, '""');
      const subCategory = String(item.sub_category ?? '').replace(/"/g, '""');
      const os = String(item.os ?? '').replace(/"/g, '""');
      const price = Number(item.price ?? 0).toFixed(2);
      const priceUsd = Number(item.price_usd ?? 0).toFixed(2);
      return `"${name}","${price}","${priceUsd}","${os}","${fileLink}","${category}","${subCategory}"`;
    }).join('\n');

    const csv = header + rows;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `dmerch-products-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const deleteSelectedProducts = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    if (selectedProductIds.length === 0) {
      return;
    }
    const confirmed = window.confirm(`Delete ${selectedProductIds.length} selected product(s)?`);
    if (!confirmed) {
      return;
    }
    
    const { error } = await supabase.from('products').delete().in('id', selectedProductIds);
    if (error) {
      alert(`Error deleting products: ${error.message}`);
      return;
    }

    const selectedSet = new Set(selectedProductIds);
    setProducts((current) => current.filter((item) => !selectedSet.has(item.id)));
    setSelectedProductIds([]);
  };

  const submitReview = async (item: InboxItem, action: 'approve' | 'reject') => {
    if (!accessToken) {
      alert('Admin session expired. Please log in again.');
      setUnlocked(false);
      return;
    }

    setProcessingId(item.id);
    try {
      const response = await fetch('/api/admin-review', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          serialNo: item.referenceCode,
          action,
          deliveryLink: item.deliveryLink,
          productLinks: item.deliveryLinksByProduct ?? {},
        }),
      });

      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? `Review action failed (${response.status})`);
      }

      const nextStatus = action === 'approve' ? 'approved' : 'rejected';
      // Remove from inbox immediately for both approve and reject
      setInboxItems((current) => current.filter((row) => row.id !== item.id));
      setCrmItems((current) => current.map((row) => (row.referenceCode === item.referenceCode ? { ...row, status: nextStatus } : row)));

      alert(`Successfully ${action === 'approve' ? 'approved' : 'rejected'} ${item.referenceCode}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Review action failed';
      alert(`Approval Error: ${message}`);
    } finally {
      setProcessingId(null);
    }
  };

  const submitManualOrder = async () => {
    if (!accessToken) {
      setManualError('Admin session expired. Please log in again.');
      setUnlocked(false);
      return;
    }

    if (!manualName.trim() || !manualEmail.trim() || selectedManualProducts.length === 0) {
      setManualError('Please fill in buyer name, email, and select at least one product.');
      return;
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(manualEmail.trim())) {
      setManualError('Please enter a valid email address.');
      return;
    }

    setManualSubmitting(true);
    setManualError('');
    setManualSuccess('');

    try {
      const response = await fetch('/api/admin-manual-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          buyerName: manualName.trim(),
          buyerEmail: manualEmail.trim().toLowerCase(),
          products: selectedManualProducts,
          totalAmount: manualAmount ? Number(manualAmount) : 0,
        }),
      });

      const payload = (await response.json()) as { ok: boolean; serialNo?: string; error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? 'Manual order creation failed');
      }

      setManualSuccess(`Order ${payload.serialNo} created and approved! Delivery email sent.`);
      setManualName('');
      setManualEmail('');
      setManualProducts('');
      setManualAmount('');
      setSelectedManualProducts([]);
      setManualProductSearch('');
      void refreshCrm();
      setTimeout(() => {
        setManualSuccess('');
      }, 3000);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Manual order creation failed';
      setManualError(message);
    } finally {
      setManualSubmitting(false);
    }
  };

  const addManualProduct = (productName: string) => {
    if (productName && !selectedManualProducts.includes(productName)) {
      setSelectedManualProducts([...selectedManualProducts, productName]);
      setManualProductSearch('');
      setManualDropdownOpen(false);
    }
  };

  const removeManualProduct = (productName: string) => {
    setSelectedManualProducts(selectedManualProducts.filter(p => p !== productName));
  };

  const filteredManualProducts = useMemo(() => {
    const query = manualProductSearch.trim().toLowerCase();
    if (!query) return products.slice(0, 10);
    return products
      .filter(p => p.name.toLowerCase().includes(query))
      .slice(0, 10);
  }, [products, manualProductSearch]);

  const calculatedManualAmount = useMemo(() => {
    if (selectedManualProducts.length === 0) return 0;
    return selectedManualProducts.reduce((sum, prodName) => {
      const product = products.find(p => p.name === prodName);
      return sum + (product?.amount ?? 99);
    }, 0);
  }, [selectedManualProducts, products]);

  const clearInbox = async () => {
    if (!accessToken) {
      setLoginError('Admin session expired. Please log in again.');
      setUnlocked(false);
      return;
    }

    const confirmed = window.confirm('Archive all inbox items for all statuses? This will clear the inbox view but keep records in database history.');
    if (!confirmed) {
      return;
    }

    setInboxLoading(true);
    try {
      const response = await fetch('/api/admin-inbox?path=clear', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const payload = (await response.json()) as { ok: boolean; archivedCount?: number; error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? 'Failed to clear inbox');
      }

      setInboxItems([]);
      setLoginError('');
      await Promise.all([refreshInbox(), refreshCrm()]);
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'Failed to clear inbox');
    } finally {
      setInboxLoading(false);
    }
  };

  const filteredCrmItems = useMemo(() => {
    const query = crmSearch.trim().toLowerCase();
    return crmItems.filter((item) => {
      if (crmStatusFilter !== 'all' && item.status !== crmStatusFilter) {
        return false;
      }
      if (!query) {
        return true;
      }
      const productText = item.products.join(' | ').toLowerCase();
      return (
        item.buyerName.toLowerCase().includes(query)
        || item.buyerEmail.toLowerCase().includes(query)
        || productText.includes(query)
        || item.referenceCode.toLowerCase().includes(query)
      );
    });
  }, [crmItems, crmSearch, crmStatusFilter]);

  const totalApprovedSales = useMemo(
    () => crmItems.filter((item) => item.status === 'approved').reduce((sum, item) => sum + item.totalAmount, 0),
    [crmItems],
  );

  const todayManilaKey = toManilaDayKey(new Date());
  const pendingTodayCount = useMemo(
    () => (counterResetDayKey === todayManilaKey
      ? 0
      : inboxItems.filter((item) => item.status === 'pending' && toManilaDayKey(item.submittedAt) === todayManilaKey).length),
    [inboxItems, todayManilaKey, counterResetDayKey],
  );
  const approvedTodayCount = useMemo(
    () => (counterResetDayKey === todayManilaKey
      ? 0
      : crmItems.filter((item) => item.status === 'approved' && toManilaDayKey(item.submittedAt) === todayManilaKey).length),
    [crmItems, todayManilaKey, counterResetDayKey],
  );

  const resetTodayCounters = () => {
    window.localStorage.setItem(COUNTERS_RESET_DAY_KEY, todayManilaKey);
    setCounterResetDayKey(todayManilaKey);
  };

  const submitCrmManage = async (
    payload: {
      serialNo: string;
      action: 'edit' | 'archive' | 'approve' | 'reject';
      buyerName?: string;
      buyerEmail?: string;
      products?: string[];
      totalAmount?: number;
    },
  ) => {
    if (!accessToken) {
      await logoutForAuthFailure('Admin session expired. Please log in again.');
      return false;
    }

    const response = await fetch('/api/admin-crm?path=manage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });
    const result = (await readApiPayload(response)) as { ok?: boolean; error?: string };

    if (response.status === 401 || response.status === 403) {
      const reason = result.error ?? (response.status === 401 ? 'Admin session expired.' : 'Admin role required.');
      await logoutForAuthFailure(reason);
      return false;
    }

    if (!response.ok || !result.ok) {
      throw new Error(result.error ?? `CRM action failed (${response.status})`);
    }

    return true;
  };

  const handleArchiveSelectedCrm = async () => {
    const selected = crmItems.find((item) => item.id === selectedCrmRecordId);
    if (!selected) {
      alert('Select one CRM transaction first.');
      return;
    }

    const confirmed = window.confirm(`Archive ${selected.referenceCode} from CRM list?`);
    if (!confirmed) {
      return;
    }

    try {
      const ok = await submitCrmManage({ serialNo: selected.referenceCode, action: 'archive' });
      if (!ok) {
        return;
      }
      setCrmItems((current) => current.filter((item) => item.id !== selected.id));
      setSelectedCrmRecordId(null);
      setCrmEditorOpen(false);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to archive CRM record');
    }
  };

  const handleCrmBulkImport = async () => {
    const raw = crmBulkData.trim();
    if (!raw) {
      setCrmBulkStatus('Paste CRM CSV rows first.');
      return;
    }

    const rows = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const parsed = rows.map((line) => {
      const parts = line.split(',').map((part) => part.trim().replace(/^"|"$/g, ''));
      const [serialNo, buyerName, buyerEmail, productsRaw, amountRaw, statusRaw, submittedAt] = parts;
      const products = String(productsRaw ?? '')
        .split('|')
        .map((item) => item.trim())
        .filter(Boolean);
      return {
        serialNo: String(serialNo ?? '').trim(),
        buyerName: String(buyerName ?? '').trim(),
        buyerEmail: String(buyerEmail ?? '').trim(),
        products,
        totalAmount: Number(amountRaw ?? 0),
        status: String(statusRaw ?? '').trim().toLowerCase(),
        submittedAt: String(submittedAt ?? '').trim(),
      };
    }).filter((row) => row.serialNo && row.buyerEmail && row.products.length > 0 && Number.isFinite(row.totalAmount));

    if (parsed.length === 0) {
      setCrmBulkStatus('No valid rows found. Use: Serial No, Username, Email, Products, Amount, Status, Date.');
      return;
    }

    try {
      const response = await fetch('/api/admin-crm?path=bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ rows: parsed }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string; inserted?: number };
      if (!response.ok || !payload.ok) {
        setCrmBulkStatus(payload.error ?? 'CRM bulk import failed.');
        return;
      }
      setCrmBulkStatus(`Imported ${payload.inserted ?? parsed.length} CRM rows.`);
      setCrmBulkData('');
      void refreshCrm();
    } catch (err) {
      setCrmBulkStatus(err instanceof Error ? err.message : 'CRM bulk import failed.');
    }
  };

  const handleCrmDecision = async (action: 'approve' | 'reject') => {
    const selected = crmItems.find((item) => item.id === selectedCrmRecordId);
    if (!selected) {
      alert('Select one CRM transaction first.');
      return;
    }

    const confirmed = window.confirm(`${action === 'approve' ? 'Approve' : 'Cancel link for'} ${selected.referenceCode}?`);
    if (!confirmed) {
      return;
    }

    try {
      const ok = await submitCrmManage({ serialNo: selected.referenceCode, action });
      if (!ok) {
        return;
      }
      setCrmItems((current) => current.map((item) => (
        item.id === selected.id ? { ...item, status: action === 'approve' ? 'approved' : 'rejected' } : item
      )));
      setCrmEditorOpen(false);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to update CRM status');
    }
  };

  const handleCrmFileImport = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result;
      if (typeof text === 'string') {
        setCrmBulkData(text);
        alert('File content loaded into CRM Mass Upload area. Click "Upload CRM" to finish.');
      }
    };
    reader.readAsText(file);
    // Reset input
    event.target.value = '';
  };

  const handleOpenCrmEditor = () => {
    const selected = crmItems.find((item) => item.id === selectedCrmRecordId);
    if (!selected) {
      alert('Select one CRM transaction first.');
      return;
    }

    setCrmEditName(selected.buyerName);
    setCrmEditEmail(selected.buyerEmail);
    setCrmEditProducts(selected.products.join('\n'));
    setCrmEditAmount(String(selected.totalAmount));
    setCrmEditorOpen(true);
  };

  const handleSaveCrmEdit = async () => {
    const selected = crmItems.find((item) => item.id === selectedCrmRecordId);
    if (!selected) {
      alert('Select one CRM transaction first.');
      return;
    }

    const buyerName = crmEditName.trim();
    const buyerEmail = crmEditEmail.trim().toLowerCase();
    const totalAmount = Number(crmEditAmount);
    const products = crmEditProducts
      .split(/\r?\n|\|/)
      .map((item) => item.trim())
      .filter(Boolean);

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!buyerName || !emailPattern.test(buyerEmail) || !Number.isFinite(totalAmount) || totalAmount <= 0 || products.length === 0) {
      alert('Please provide valid buyer name, one valid buyer email, products, and amount.');
      return;
    }

    try {
      const ok = await submitCrmManage({
        serialNo: selected.referenceCode,
        action: 'edit',
        buyerName,
        buyerEmail,
        products,
        totalAmount,
      });
      if (!ok) {
        return;
      }

      setCrmItems((current) => current.map((item) => (
        item.id === selected.id
          ? {
            ...item,
            buyerName,
            buyerEmail,
            products,
            totalAmount,
          }
          : item
      )));
      setCrmEditorOpen(false);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to update CRM record');
    }
  };

  const approvedCrmItems = useMemo(() => crmItems.filter((item) => item.status === 'approved'), [crmItems]);
  const crmSummaryCounts = useMemo(() => {
    return {
      total: crmItems.length,
      approved: crmItems.filter((i) => i.status === 'approved').length,
      pending: crmItems.filter((i) => i.status === 'pending').length,
      rejected: crmItems.filter((i) => i.status === 'rejected').length,
    };
  }, [crmItems]);

  const analyticsCards = useMemo(() => {
    const now = new Date(nowMs);
    const approvedItems = approvedCrmItems;

    const sumRange = (start: Date, end: Date) => {
      const startMs = start.getTime();
      const endMs = end.getTime();
      return approvedItems.reduce((sum, item) => {
        const timestamp = new Date(item.submittedAt).getTime();
        if (Number.isNaN(timestamp)) {
          return sum;
        }
        return timestamp >= startMs && timestamp < endMs ? sum + item.totalAmount : sum;
      }, 0);
    };

    const weekStart = startOfWeek(now);
    const monthStart = startOfMonth(now);
    const quarterStart = startOfQuarter(now);
    const yearStart = startOfYear(now);

    const periods = [
      {
        key: 'week',
        title: 'This Week',
        currentStart: weekStart,
        currentEnd: now,
        previousStart: subtractDays(weekStart, 7),
        previousEnd: weekStart,
      },
      {
        key: 'month',
        title: 'This Month',
        currentStart: monthStart,
        currentEnd: now,
        previousStart: startOfMonth(subtractMonths(monthStart, 1)),
        previousEnd: monthStart,
      },
      {
        key: 'quarter',
        title: 'This Quarter',
        currentStart: quarterStart,
        currentEnd: now,
        previousStart: startOfQuarter(subtractMonths(quarterStart, 3)),
        previousEnd: quarterStart,
      },
      {
        key: 'year',
        title: 'This Year',
        currentStart: yearStart,
        currentEnd: now,
        previousStart: startOfYear(subtractYears(yearStart, 1)),
        previousEnd: yearStart,
      },
    ] as const;

    return periods.map((period) => {
      const currentSales = sumRange(period.currentStart, period.currentEnd);
      const previousSales = sumRange(period.previousStart, period.previousEnd);
      const delta = currentSales - previousSales;
      const percentChange = previousSales > 0 ? (delta / previousSales) * 100 : null;

      const evaluation = percentChange === null
        ? (currentSales > 0 ? 'Excellent' : 'Needs Attention')
        : percentChange >= 15
          ? 'Excellent'
          : percentChange >= 0
            ? 'Good'
            : 'Needs Attention';

      return {
        ...period,
        currentSales,
        previousSales,
        delta,
        percentChange,
        evaluation,
      };
    });
  }, [approvedCrmItems, nowMs]);

  const analyticsRange = useMemo(() => {
    const now = new Date(nowMs);
    const weekStart = startOfWeek(now);
    const monthStart = startOfMonth(now);
    const quarterStart = startOfQuarter(now);
    const yearStart = startOfYear(now);

    switch (analyticsPeriod) {
      case 'month':
        return { label: 'This Month', start: monthStart, end: now };
      case 'quarter':
        return { label: 'This Quarter', start: quarterStart, end: now };
      case 'year':
        return { label: 'This Year', start: yearStart, end: now };
      default:
        return { label: 'This Week', start: weekStart, end: now };
    }
  }, [analyticsPeriod, nowMs]);

  const analyticsProducts = useMemo(() => {
    const startMs = analyticsRange.start.getTime();
    const endMs = analyticsRange.end.getTime();
    const map = new Map<string, { name: string; count: number; total: number }>();

    approvedCrmItems.forEach((item) => {
      const timestamp = new Date(item.submittedAt).getTime();
      if (Number.isNaN(timestamp) || timestamp < startMs || timestamp >= endMs) {
        return;
      }
      if (!item.products.length) {
        return;
      }
      const perProduct = item.totalAmount / item.products.length;
      item.products.forEach((productName) => {
        const key = productName.trim();
        if (!key) return;
        const existing = map.get(key);
        if (existing) {
          existing.count += 1;
          existing.total += perProduct;
        } else {
          map.set(key, { name: key, count: 1, total: perProduct });
        }
      });
    });

    return Array.from(map.values())
      .sort((a, b) => b.count - a.count || b.total - a.total || a.name.localeCompare(b.name));
  }, [analyticsRange, approvedCrmItems]);

  const bestSeller = analyticsProducts[0] ?? null;

  const handleLogout = async () => {
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
    inboxAutoMappedRef.current = false;
    setAccessToken('');
    setUnlocked(false);
  };

  const tabItems: Array<{ key: AdminTab; label: string; icon: typeof BarChart3 }> = [
    { key: 'analytics', label: 'Analytics', icon: BarChart3 },
    { key: 'approvals', label: 'Approvals', icon: Inbox },
    { key: 'products', label: 'Products', icon: PackageSearch },
    { key: 'crm', label: 'CRM', icon: UsersRound },
  ];

  const hiddenLoginErrors = new Set(['Admin role required.', 'Admin account is not allowlisted.']);
  const shouldShowLoginError = loginError.trim().length > 0 && !hiddenLoginErrors.has(loginError.trim());

  if (authChecking) {
    return (
      <div className="min-h-screen bg-[#050505] text-white px-4 py-10">
        <div className="mx-auto max-w-md rounded-xl border border-cyan-500/30 bg-[#071018]/80 p-6 text-center">
          <p className="text-sm font-mono uppercase tracking-[0.18em] text-cyan-200">Checking admin session...</p>
        </div>
      </div>
    );
  }

  if (!unlocked) {
    return (
      <div className="min-h-screen bg-[#050505] text-white px-4 py-10">
        <div className="mx-auto max-w-md rounded-xl border border-cyan-500/30 bg-[#071018]/80 p-6">
          <h1 className="text-xl font-black tracking-[0.12em] uppercase text-cyan-200">Admin Portal Access</h1>
          <p className="mt-2 text-sm text-cyan-100/80">Sign in with Google to continue.</p>
          <div className="mt-5 space-y-3">
            {shouldShowLoginError ? <p className="text-xs text-red-300">{loginError}</p> : null}
            <button onClick={() => { void handleGoogleLogin(); }} className="cyber-btn cyber-btn-primary w-full">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="h-4 w-4" aria-hidden="true" focusable="false">
                <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303C33.655 32.657 29.196 36 24 36c-6.627 0-12-5.373-12-12S17.373 12 24 12c3.059 0 5.842 1.154 7.959 3.041l5.657-5.657C34.053 6.053 29.274 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
                <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 16.109 19.002 12 24 12c3.059 0 5.842 1.154 7.959 3.041l5.657-5.657C34.053 6.053 29.274 4 24 4c-7.682 0-14.319 4.337-17.694 10.691z" />
                <path fill="#4CAF50" d="M24 44c5.176 0 9.86-1.977 13.409-5.191l-6.19-5.238C29.148 35.091 26.715 36 24 36c-5.176 0-9.617-3.318-11.266-7.946l-6.522 5.025C9.548 39.556 16.227 44 24 44z" />
                <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.084 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
              </svg>
              Sign In with Google
            </button>
            <button onClick={() => { window.location.href = '/'; }} className="cyber-btn cyber-btn-secondary w-full">Back to Portal</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white px-4 py-6 sm:py-10">
      <main className="mx-auto max-w-7xl space-y-5">
        <div className="rounded-xl border border-cyan-500/35 bg-[#071018]/85 p-4 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-cyan-300">DMerch Control</p>
              <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-[0.1em] text-cyan-100">Admin Portal</h1>
              <p className="mt-1 text-xs text-cyan-100/80">Analytics, approvals, products, and CRM in one dashboard.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => { window.location.href = '/'; }} className="cyber-btn cyber-btn-secondary"><ArrowLeft size={14} />Main Portal</button>
              <button onClick={() => { void handleLogout(); }} className="cyber-btn cyber-btn-secondary">Logout</button>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-cyan-500/30 bg-[#041019]/80 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-2 overflow-x-auto">
              {tabItems.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`cyber-btn whitespace-nowrap ${activeTab === tab.key ? 'cyber-btn-primary' : 'cyber-btn-secondary'}`}
                  >
                    <Icon size={14} /> {tab.label}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => { void refreshAdminData(); }}
              className="cyber-btn cyber-btn-secondary whitespace-nowrap"
              title="Sync Inbox + CRM"
              aria-label="Sync Inbox + CRM"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {activeTab === 'analytics' ? (
          <section className="rounded-xl border border-cyan-500/30 bg-[#041019]/80 p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.2em] text-cyan-300"><BarChart3 size={14} />Approved Sales Analytics</p>
              <button onClick={() => { void refreshCrm(); }} className="cyber-btn cyber-btn-secondary">{crmLoading ? 'Refreshing...' : 'Refresh Data'}</button>
            </div>
            <div className="grid gap-4 lg:grid-cols-4 sm:grid-cols-2">
              {analyticsCards.map((card) => {
                const isPositive = card.delta >= 0;
                const isActive = analyticsPeriod === card.key;
                return (
                  <button
                    type="button"
                    key={card.key}
                    onClick={() => setAnalyticsPeriod(card.key)}
                    className={`rounded-lg border bg-black/35 p-3 text-left transition ${isActive ? 'border-cyan-400/60 shadow-[0_0_20px_rgba(0,243,255,0.25)]' : 'border-cyan-500/20 hover:border-cyan-400/40'}`}
                  >
                    <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-cyan-300">{card.title}</p>
                    <p className="mt-2 text-xl font-black text-cyan-100">{toPhp(card.currentSales)}</p>
                    <p className="mt-1 text-xs text-cyan-200">Previous: {toPhp(card.previousSales)}</p>
                    <p className={`mt-1 text-xs ${isPositive ? 'text-emerald-300' : 'text-red-300'}`}>
                      {isPositive ? '+' : '-'}{toPhp(Math.abs(card.delta))} ({card.percentChange === null ? 'N/A' : `${card.percentChange >= 0 ? '+' : ''}${card.percentChange.toFixed(1)}%`})
                    </p>
                    <p className="mt-2 text-[11px] font-mono uppercase tracking-[0.18em] text-cyan-100">Evaluation: {card.evaluation}</p>
                  </button>
                );
              })}
            </div>
            <div className="rounded-lg border border-cyan-500/20 bg-black/30 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-cyan-300">Products Bought — {analyticsRange.label}</p>
                <div className="flex flex-wrap gap-2">
                  {(['week', 'month', 'quarter', 'year'] as const).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setAnalyticsPeriod(key)}
                      className={`rounded-full border px-3 py-1 text-[10px] font-mono uppercase tracking-[0.2em] ${analyticsPeriod === key ? 'border-cyan-400 bg-cyan-500/20 text-cyan-100' : 'border-cyan-500/20 text-cyan-300 hover:border-cyan-400/40'}`}
                    >
                      {key}
                    </button>
                  ))}
                </div>
              </div>

              {analyticsProducts.length === 0 ? (
                <p className="text-xs text-cyan-200">No approved products in this period yet.</p>
              ) : (
                <div className="grid gap-2">
                  {analyticsProducts.map((item, index) => {
                    const isBest = index === 0;
                    const highlight = isBest && analyticsPeriod === 'week';
                    return (
                      <div key={item.name} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-cyan-500/15 bg-black/35 px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-semibold ${highlight ? 'text-emerald-300' : 'text-cyan-100'}`}>{item.name}</span>
                          {isBest ? (
                            <span className={`rounded-full border px-2 py-0.5 text-[9px] font-mono uppercase ${highlight ? 'border-emerald-400/40 text-emerald-200' : 'border-cyan-400/30 text-cyan-200'}`}>
                              Bestseller
                            </span>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-3 text-[10px] font-mono uppercase tracking-[0.18em] text-cyan-200">
                          <span>{item.count}x</span>
                          <span>{toPhp(item.total)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {bestSeller ? (
                <div className="mt-3 flex items-center justify-between rounded-md border border-cyan-500/20 bg-cyan-500/5 px-3 py-2 text-xs">
                  <span className="text-cyan-200">Bestseller</span>
                  <span className={`${analyticsPeriod === 'week' ? 'text-emerald-300' : 'text-cyan-100'} font-semibold`}>{bestSeller.name}</span>
                </div>
              ) : null}
            </div>
            <div className="rounded-lg border border-cyan-500/20 bg-black/30 p-4">
              <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-cyan-300">Total Approved Sales</p>
              <p className="mt-2 text-3xl font-black text-cyan-100">{toPhp(totalApprovedSales)}</p>
              <p className="mt-1 text-xs text-cyan-200">Based on all approved records in CRM history.</p>
            </div>
          </section>
        ) : null}

        {activeTab === 'approvals' ? (
          <section className="rounded-xl border border-cyan-500/30 bg-[#041019]/80 p-4 sm:p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.2em] text-cyan-300"><Inbox size={14} />Buyer Approval Inbox</p>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => { void refreshInbox(); }} className="cyber-btn cyber-btn-secondary">{inboxLoading ? 'Refreshing...' : 'Refresh Inbox'}</button>
                <button onClick={resetTodayCounters} className="cyber-btn cyber-btn-secondary">Reset Today Counters</button>
                <button onClick={() => { void clearInbox(); }} className="cyber-btn cyber-btn-secondary">Clear Inbox</button>
                <button
                  onClick={() => setIsManualEncodeExpanded(!isManualEncodeExpanded)}
                  className="cyber-btn cyber-btn-primary"
                >
                  <Pencil size={14} /> {isManualEncodeExpanded ? 'CLOSE MANUAL ENCODE' : 'MANUAL ENCODE'}
                </button>
              </div>
            </div>

            {isManualEncodeExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                className="mb-6 overflow-hidden rounded-lg border border-cyan-500/40 bg-cyan-500/5 p-5 shadow-[0_0_30px_rgba(0,243,255,0.05)]"
              >
                <div className="mb-4 flex items-center justify-between">
                  <p className="inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.2em] text-cyan-300"><Pencil size={14} />Manual Encode Order</p>
                  <button onClick={() => setIsManualEncodeExpanded(false)} className="text-cyan-400 hover:text-white">✕</button>
                </div>
                <p className="mb-4 text-xs text-cyan-200/80">Create a manual order without payment. This will auto-approve and send delivery email.</p>

                {manualError && (
                  <div className="mb-3 rounded-md border border-red-400/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                    {manualError}
                  </div>
                )}
                {manualSuccess && (
                  <div className="mb-3 rounded-md border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                    {manualSuccess}
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-4">
                    <div>
                      <label className="mb-1 block text-xs font-mono uppercase tracking-wider text-cyan-300">Buyer Name *</label>
                      <input
                        value={manualName}
                        onChange={(e) => setManualName(e.target.value)}
                        className="w-full rounded-md border border-cyan-500/40 bg-black/40 px-3 py-2 text-sm text-cyan-100 placeholder-cyan-500/50"
                        placeholder="Enter buyer name"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-mono uppercase tracking-wider text-cyan-300">Buyer Email *</label>
                      <input
                        value={manualEmail}
                        onChange={(e) => setManualEmail(e.target.value)}
                        type="email"
                        className="w-full rounded-md border border-cyan-500/40 bg-black/40 px-3 py-2 text-sm text-cyan-100 placeholder-cyan-500/50"
                        placeholder="buyer@email.com"
                      />
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="mb-1 block text-xs font-mono uppercase tracking-wider text-cyan-300">Products *</label>
                      <div className="relative">
                        <div className="flex gap-2">
                          <input
                            value={manualProductSearch}
                            onChange={(e) => { setManualProductSearch(e.target.value); setManualDropdownOpen(true); }}
                            onFocus={() => setManualDropdownOpen(true)}
                            className="flex-1 rounded-md border border-cyan-500/40 bg-black/40 px-3 py-2 text-sm text-cyan-100 placeholder-cyan-500/50"
                            placeholder="Search products..."
                          />
                        </div>
                        {manualDropdownOpen && filteredManualProducts.length > 0 && (
                          <div className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border border-cyan-500/40 bg-[#0a1525] shadow-2xl">
                            {filteredManualProducts.map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => addManualProduct(p.name)}
                                className="w-full px-3 py-2 text-left text-sm text-cyan-100 hover:bg-cyan-500/20"
                              >
                                {p.name} <span className="text-cyan-400">- {toPhp(p.amount)}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      {selectedManualProducts.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {selectedManualProducts.map((prod) => (
                            <span key={prod} className="inline-flex items-center gap-1 rounded-full border border-cyan-400/40 bg-cyan-500/10 px-2 py-1 text-xs text-cyan-100">
                              {prod}
                              <button type="button" onClick={() => removeManualProduct(prod)} className="ml-1 text-cyan-300 hover:text-white">×</button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-mono uppercase tracking-wider text-cyan-300">
                        Total Amount (Auto: {toPhp(calculatedManualAmount)})
                      </label>
                      <input
                        value={manualAmount}
                        onChange={(e) => setManualAmount(e.target.value)}
                        type="number"
                        className="w-full rounded-md border border-cyan-500/40 bg-black/40 px-3 py-2 text-sm text-cyan-100"
                        placeholder="Leave empty for auto"
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-5 flex justify-end">
                  <button
                    onClick={() => { void submitManualOrder(); }}
                    disabled={manualSubmitting}
                    className="cyber-btn cyber-btn-primary"
                  >
                    {manualSubmitting ? 'Processing...' : 'Submit & Auto-Approve'}
                  </button>
                </div>
              </motion.div>
            )}
            <p className="mb-3 text-[11px] font-mono uppercase tracking-[0.16em] text-cyan-200">
              Last sync: {lastInboxSyncAt ? toReadableDate(lastInboxSyncAt) : 'Never'} | Rows fetched: {inboxLastCount} | Pending Today: {pendingTodayCount} | Approved Today: {approvedTodayCount}
            </p>
            {inboxError ? (
              <div className="mb-3 rounded-md border border-red-400/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                Inbox sync error: {inboxError}
              </div>
            ) : null}
            <div className="space-y-3">
              {inboxItems.length === 0 ? <p className="rounded-md border border-cyan-500/20 bg-black/25 px-3 py-4 text-xs text-cyan-200">No active inbox records. Click Refresh Inbox. If still empty, check sync error above.</p> : null}
              {inboxItems.map((item) => (
                <motion.div key={item.id} layout className="rounded-lg border border-cyan-500/20 bg-black/35 p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-cyan-100">{item.referenceCode}</p>
                      <p className="text-xs text-cyan-200">{item.buyerName} ({item.buyerEmail})</p>
                      <p className="mt-1 text-xs text-gray-300">Products: {item.products.join(' | ')}</p>
                      <p className="mt-1 text-xs text-cyan-300">Paid via: {item.paymentPortalUsed ? String(item.paymentPortalUsed).toUpperCase() : 'N/A'}</p>
                      <p className="mt-1 text-xs text-cyan-300">Payment detail used: {item.paymentDetailUsed || 'N/A'}</p>
                      <p className="mt-1 text-xs text-cyan-300">Checkout time: {toManilaDateTime(item.submittedAt)}</p>
                      <p className="mt-1 text-xs text-amber-200">Waiting time: {toWaitingDuration(item.submittedAt, nowMs)}</p>
                    </div>
                    <span className={`rounded-full border px-2 py-1 text-[10px] font-mono uppercase ${item.status === 'pending' ? 'border-amber-400/40 text-amber-200' : item.status === 'approved' ? 'border-emerald-400/40 text-emerald-200' : 'border-red-400/40 text-red-200'}`}>
                      {item.status}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-cyan-300/90">
                    Downloads entitlement (admin): {item.entitlementUnlimited ? 'UNLIMITED' : `${item.entitlementUsed ?? 0}/${item.entitlementLimit ?? 10}`}
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                    <div className="relative group">
                      <input
                        value={item.deliveryLink}
                        onChange={(event) => updateInbox(item.id, { deliveryLink: event.target.value })}
                        className="w-full rounded-md border border-cyan-500/35 bg-black/35 px-3 py-2 text-xs focus:border-cyan-400 focus:outline-none pr-10"
                        placeholder={item.deliveryLink ? "Auto-mapped link detected..." : "Paste delivery link to send customer"}
                      />
                      {item.deliveryLink && (
                        <div className="absolute right-2 top-1.5 text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                          <CheckCircle2 size={12} /> Sync
                        </div>
                      )}
                      {item.deliveryLinksByProduct && Object.keys(item.deliveryLinksByProduct).length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-2">
                          {Object.entries(item.deliveryLinksByProduct).map(([prod, link]) => (
                            <div key={prod} className="text-[9px] text-cyan-400/70 border border-cyan-500/20 px-1 rounded truncate max-w-[120px]" title={`${prod}: ${link}`}>
                              {prod}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => { void submitReview(item, 'approve'); }}
                      className="cyber-btn cyber-btn-primary"
                      disabled={!item.deliveryLink.trim() || processingId === item.id}
                    >
                      {processingId === item.id ? 'Processing...' : <><CheckCircle2 size={14} /> Approve</>}
                    </button>
                    <button
                      onClick={() => { void submitReview(item, 'reject'); }}
                      className="cyber-btn cyber-btn-secondary"
                      disabled={processingId === item.id}
                    >
                      <ShieldAlert size={14} /> Reject
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          </section>
        ) : null}



        {activeTab === 'products' ? (
          <>
            {(() => {
              const categoryCounts = products.reduce((acc, p) => {
                const cat = p.category?.trim() || 'Uncategorized';
                acc[cat] = (acc[cat] || 0) + 1;
                return acc;
              }, {} as Record<string, number>);
              const sortedCategories = Object.entries(categoryCounts).sort((a, b) => (b[1] as number) - (a[1] as number));
              return (
            <section className="rounded-xl border border-cyan-500/30 bg-[#041019]/80 p-4 sm:p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.2em] text-cyan-300"><PackageSearch size={14} />Products Manager</p>
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-cyan-200 bg-cyan-500/20 rounded">Total: {products.length}</span>
                  {sortedCategories.map(([cat, count]) => (
                    <span key={cat} className="inline-flex items-center px-2 py-1 text-[10px] font-mono text-cyan-100 bg-cyan-500/10 border border-cyan-500/20 rounded">{cat}: {count}</span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    className="rounded-md border border-cyan-500/40 bg-black/35 px-3 py-2 text-xs"
                    placeholder="Search file name"
                  />
                  <select
                    value={searchScope}
                    onChange={(event) => setSearchScope(event.target.value as typeof searchScope)}
                    className="rounded-md border border-cyan-500/40 bg-black/35 px-3 py-2 text-xs"
                  >
                    <option value="all">All fields</option>
                    <option value="name">File name</option>
                    <option value="category">Category</option>
                    <option value="subcategory">Sub category</option>
                    <option value="amount">Amount</option>
                  </select>
                  <button onClick={() => { void addProductRow(); }} className="cyber-btn cyber-btn-primary" aria-label="Add product">
                    <Plus size={14} />
                  </button>
                  <button
                    onClick={() => {
                      const header = 'Name,File Link,Category,Sub Category,Amount\n';
                      const rowsCsv = filteredProducts.map((item) => {
                        return `"${item.name}","${item.fileLink || ''}","${item.category || ''}","${item.sub_category || ''}","${item.amount}"`;
                      }).join('\n');
                      const csv = header + rowsCsv;
                      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                      const d = new Date();
                      a.download = `DMerch-${d.getFullYear()}-${months[d.getMonth()]}-${String(d.getDate()).padStart(2, '0')}.csv`;
                      document.body.appendChild(a);
                      a.click();
                      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
                    }}
                    className="cyber-btn cyber-btn-secondary"
                    title="Export CSV"
                    aria-label="Export CSV"
                  >
                    <Download size={14} />
                  </button>
                </div>
              </div>
              <div className="mb-3 flex flex-wrap gap-2 rounded-md border border-cyan-500/20 bg-black/25 p-2">
                 <button onClick={areAllProductsSelected ? clearSelectedProducts : selectAllProducts} className="cyber-btn cyber-btn-secondary">
                   {areAllProductsSelected ? 'Clear' : 'Select All Result'}
                 </button>
                 <button onClick={selectAllOnPage} className="cyber-btn cyber-btn-secondary">
                   Select This Page
                 </button>
                 <span className="inline-flex items-center px-2 text-xs text-cyan-200">Selected: {selectedCount}</span>
                <input
                  value={massAmount}
                  onChange={(event) => setMassAmount(event.target.value)}
                  type="number"
                  className="rounded-md border border-cyan-500/40 bg-black/35 px-3 py-2 text-xs"
                  placeholder="Mass amount"
                />
                <button disabled={selectedCount === 0} onClick={applyMassAmount} className="cyber-btn cyber-btn-secondary">Mass Edit Amount</button>
                <input
                  value={massCategory}
                  onChange={(event) => setMassCategory(event.target.value)}
                  className="rounded-md border border-cyan-500/40 bg-black/35 px-3 py-2 text-xs"
                  placeholder="Mass Category"
                />
                <button disabled={selectedCount === 0} onClick={applyMassCategory} className="cyber-btn cyber-btn-secondary">Mass Edit Category</button>
                <button disabled={selectedCount === 0} onClick={deleteSelectedProducts} className="cyber-btn cyber-btn-secondary">Mass Delete</button>
              </div>
              <div className="h-[60vh] overflow-y-auto overflow-x-auto rounded-lg border border-cyan-500/20">
                <table className="w-full min-w-[1100px] border-collapse text-xs">
                  <thead className="sticky top-0 z-10 bg-cyan-500/10 text-cyan-200">
                    <tr>
                      <th className="px-2 py-2 text-center"></th>
                      <th className="px-2 py-2 text-left">File Name</th>
                      <th className="px-2 py-2 text-left">Image URL</th>
                      <th className="px-2 py-2 text-left">File Link</th>
                      <th className="px-2 py-2 text-left">Category</th>
                      <th className="px-2 py-2 text-left">Sub Category</th>
                      <th className="px-2 py-2 text-right">Amount</th>
                      <th className="px-2 py-2 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.slice((productsPage - 1) * productsPerPage, productsPage * productsPerPage).map((item) => (
                      <tr key={item.id} className="border-t border-cyan-500/15">
                        <td className="px-2 py-2 text-center">
                          <button
                            type="button"
                            onMouseDown={(event) => {
                              event.preventDefault();
                              startDragSelect(item.id);
                            }}
                            onMouseEnter={() => handleDragEnter(item.id)}
                            className={`inline-flex h-5 w-5 items-center justify-center rounded-full border ${selectedIdsSet.has(item.id) ? 'border-cyan-300 bg-cyan-400/20' : 'border-cyan-500/35'}`}
                            aria-label="Select row"
                          >
                            {selectedIdsSet.has(item.id) ? <span className="h-2 w-2 rounded-full bg-cyan-300" /> : null}
                          </button>
                        </td>
                        <td className="px-2 py-2 relative group">
                          <input value={item.name} onChange={(event) => updateProduct(item.id, { name: event.target.value })} className="w-full rounded border border-cyan-500/30 bg-black/35 px-2 py-1" />
                          {item.image_url && item.category?.toLowerCase().includes('ebook') && (
                            <div className="absolute z-50 hidden group-hover:block bottom-full left-0 mb-2 p-2 bg-black/95 border border-cyan-500/40 rounded-lg shadow-2xl">
                              <img src={item.image_url} alt="Cover preview" className="max-w-[180px] max-h-[240px] object-contain rounded" />
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          <input value={item.image_url} onChange={(event) => updateProduct(item.id, { image_url: event.target.value })} className="w-full rounded border border-cyan-500/30 bg-black/35 px-2 py-1" placeholder="Image URL" />
                        </td>
                        <td className="px-2 py-2">
                          <input value={item.fileLink} onChange={(event) => updateProduct(item.id, { fileLink: event.target.value })} className="w-full rounded border border-cyan-500/30 bg-black/35 px-2 py-1" placeholder="https://drive.google.com/..." />
                        </td>
                        <td className="px-2 py-2">
                          <input value={item.category} onChange={(event) => updateProduct(item.id, { category: event.target.value })} className="w-full rounded border border-cyan-500/30 bg-black/35 px-2 py-1" placeholder="Software, Games, etc." />
                        </td>
                        <td className="px-2 py-2">
                          <input value={item.sub_category} onChange={(event) => updateProduct(item.id, { sub_category: event.target.value })} className="w-full rounded border border-cyan-500/30 bg-black/35 px-2 py-1" placeholder="Graphics, Games, etc." />
                        </td>
                        <td className="px-2 py-2">
                          <input type="number" value={item.amount} onChange={(event) => updateProduct(item.id, { amount: Number(event.target.value || 0) })} className="w-full rounded border border-cyan-500/30 bg-black/35 px-2 py-1 text-right" />
                        </td>
                        <td className="px-2 py-2 text-center">
                          <button onClick={() => removeProduct(item.id)} className="inline-flex h-8 w-8 items-center justify-center rounded border border-red-400/45 text-red-300 hover:bg-red-500/10">
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              <div className="mt-4 flex flex-col items-center justify-between gap-4 border-t border-cyan-500/20 pt-4 sm:flex-row">
                <div className="flex items-center gap-3 text-xs text-cyan-300/80">
                  <span className="font-mono uppercase tracking-widest">Show</span>
                  <select
                    value={productsPerPage}
                    onChange={(e) => {
                      setProductsPerPage(Number(e.target.value));
                      setProductsPage(1);
                    }}
                    className="rounded border border-cyan-500/40 bg-black/40 px-2 py-1 text-cyan-100"
                  >
                    {[20, 50, 100, 250, 500].map(size => (
                      <option key={size} value={size}>{size}</option>
                    ))}
                  </select>
                  <span className="font-mono uppercase tracking-widest">per page</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    disabled={productsPage === 1}
                    onClick={() => setProductsPage(prev => Math.max(1, prev - 1))}
                    className="cyber-btn cyber-btn-secondary p-2 disabled:opacity-30"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  
                  <div className="flex items-center gap-1">
                    {(() => {
                      const totalPages = Math.ceil(filteredProducts.length / productsPerPage);
                      const pages = [];
                      const maxVisible = 5;
                      
                      let start = Math.max(1, productsPage - Math.floor(maxVisible / 2));
                      let end = Math.min(totalPages, start + maxVisible - 1);
                      if (end - start + 1 < maxVisible) start = Math.max(1, end - maxVisible + 1);

                      for (let i = start; i <= end; i++) {
                        pages.push(
                          <button
                            key={i}
                            onClick={() => setProductsPage(i)}
                            className={`min-w-[32px] rounded h-8 text-[10px] font-mono transition-all ${productsPage === i ? 'bg-cyan-500 border border-cyan-400 text-black shadow-[0_0_10px_rgba(0,243,255,0.4)]' : 'border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/10'}`}
                          >
                            {i}
                          </button>
                        );
                      }
                      return pages;
                    })()}
                  </div>

                  <button
                    disabled={productsPage >= Math.ceil(filteredProducts.length / productsPerPage)}
                    onClick={() => setProductsPage(prev => prev + 1)}
                    className="cyber-btn cyber-btn-secondary p-2 disabled:opacity-30"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>

                <div className="text-[10px] font-mono uppercase tracking-[0.15em] text-cyan-400/60">
                  Page {productsPage} of {Math.ceil(filteredProducts.length / productsPerPage) || 1} ({filteredProducts.length} total)
                </div>
              </div>
            </section>
              );})()}

            <section className="rounded-xl border border-cyan-500/30 bg-[#041019]/80 p-4 sm:p-5">
              <p className="mb-2 inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.2em] text-cyan-300"><Upload size={14} />Bulk Upload (CSV/TSV Paste)</p>
              <p className="mb-3 text-xs text-cyan-100/80">Format: <span className="font-mono">File Name, File Link, Category, Sub Category, Amount</span>. Amount defaults to 99 if empty.</p>
              <textarea
                value={bulkData}
                onChange={(event) => setBulkData(event.target.value)}
                className="h-28 w-full rounded-md border border-cyan-500/35 bg-black/40 p-3 text-xs"
                placeholder="Adobe Photoshop 2025, https://drive.google.com/..., Software, Graphics, 99"
              />
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <button onClick={exportProductsCsv} className="cyber-btn cyber-btn-secondary" title="Export CSV" aria-label="Export CSV">
                  <Download size={14} />
                </button>
                <button onClick={applyBulkImport} className="cyber-btn cyber-btn-primary">Import Rows</button>
              </div>
            </section>
          </>
        ) : null}

        {activeTab === 'crm' ? (
          <section className="rounded-xl border border-cyan-500/30 bg-[#041019]/80 p-4 sm:p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.2em] text-cyan-300"><UsersRound size={14} />CRM Orders</p>
              <div className="flex flex-wrap gap-2">
                <input
                  value={crmSearch}
                  onChange={(event) => setCrmSearch(event.target.value)}
                  className="rounded-md border border-cyan-500/40 bg-black/35 px-3 py-2 text-xs"
                  placeholder="Search username, email, product"
                />
                <select
                  value={crmStatusFilter}
                  onChange={(event) => setCrmStatusFilter(event.target.value as 'all' | 'pending' | 'approved' | 'rejected')}
                  className="rounded-md border border-cyan-500/40 bg-black/35 px-3 py-2 text-xs"
                >
                  <option value="all">All Status</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
                <button onClick={() => { void refreshCrm(); }} className="cyber-btn cyber-btn-secondary">{crmLoading ? 'Refreshing...' : 'Refresh CRM'}</button>
                <button
                  type="button"
                  onClick={() => crmFileInputRef.current?.click()}
                  className="cyber-btn cyber-btn-primary"
                  title="Import CRM from CSV file"
                >
                  <Upload size={13} /> Import
                </button>
                <button
                  onClick={() => {
                    const header = 'Serial No,Username,Email,Products,Amount (PHP),Status,Date\n';
                    const blob = new Blob([header], { type: 'text/csv;charset=utf-8;' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'dmerch-crm-template.csv';
                    document.body.appendChild(a);
                    a.click();
                    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
                  }}
                  className="cyber-btn cyber-btn-secondary"
                  title="Download CRM template"
                >
                  <Download size={13} /> Template
                </button>
                <button
                  onClick={() => {
                    // Build CSV from all crmItems (unfiltered)
                    const header = 'Serial No,Username,Email,Products,Amount (PHP),Status,Date\n';
                    const rowsCsv = filteredCrmItems.map((item) => {
                      const products = item.products.join(' | ');
                      const amount = item.totalAmount.toFixed(2);
                      const date = new Date(item.submittedAt).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' });
                      return `"${item.referenceCode}","${item.buyerName}","${item.buyerEmail}","${products}","${amount}","${item.status}","${date}"`;
                    }).join('\n');
                    const csv = header + rowsCsv;
                    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `dmerch-crm-${new Date().toISOString().slice(0, 10)}.csv`;
                    document.body.appendChild(a);
                    a.click();
                    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
                  }}
                  className="cyber-btn cyber-btn-secondary"
                  title="Export CRM CSV"
                >
                  <Download size={13} /> Export
                </button>
                <input
                  type="file"
                  ref={crmFileInputRef}
                  onChange={handleCrmFileImport}
                  accept=".csv,.txt"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={handleOpenCrmEditor}
                  className="cyber-btn cyber-btn-secondary"
                  disabled={!selectedCrmRecordId}
                >
                  <Pencil size={13} /> Edit Selected
                </button>
                <button
                  type="button"
                  onClick={() => { void handleArchiveSelectedCrm(); }}
                  className="cyber-btn cyber-btn-secondary"
                  disabled={!selectedCrmRecordId}
                >
                  <Archive size={13} /> Archive Selected
                </button>
              </div>
            </div>
            <p className="mb-3 text-[11px] font-mono uppercase tracking-[0.16em] text-cyan-200">
              Last sync: {lastCrmSyncAt ? toReadableDate(lastCrmSyncAt) : 'Never'} | Total Saved: {crmSummaryCounts.total} | Approved: {crmSummaryCounts.approved} | Pending: {crmSummaryCounts.pending} | Rejected: {crmSummaryCounts.rejected}
            </p>
            <div className="mb-4 rounded-md border border-cyan-500/20 bg-black/25 p-3">
              <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-cyan-300">CRM Mass Upload (CSV)</p>
              <p className="mt-1 text-xs text-cyan-100/70">Format: Serial No, Username, Email, Products (use |), Amount, Status, Date</p>
              <textarea
                value={crmBulkData}
                onChange={(event) => setCrmBulkData(event.target.value)}
                className="mt-2 h-24 w-full rounded-md border border-cyan-500/35 bg-black/40 p-3 text-xs"
                placeholder="DM-2026-0001,Juan Dela Cruz,juan@email.com,Adobe Photoshop | Canva Pro,199,approved,2026-03-07"
              />
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[10px] text-cyan-200">Uploads map to Supabase verification_orders.</span>
                <button onClick={handleCrmBulkImport} className="cyber-btn cyber-btn-primary">Upload CRM</button>
              </div>
              {crmBulkStatus ? (
                <p className="mt-2 text-xs text-cyan-200">{crmBulkStatus}</p>
              ) : null}
            </div>
            {crmEditorOpen ? (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
                <div className="w-full max-w-2xl rounded-xl border border-cyan-500/40 bg-[#050b12] p-5 shadow-[0_0_40px_rgba(0,195,255,0.2)]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-mono uppercase tracking-[0.16em] text-cyan-300">CRM Pop-up</p>
                      <h3 className="mt-1 text-lg font-semibold text-white">Edit + Approve / Cancel Link</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCrmEditorOpen(false)}
                      className="cyber-btn cyber-btn-secondary"
                    >
                      Close
                    </button>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <input
                      value={crmEditName}
                      onChange={(event) => setCrmEditName(event.target.value)}
                      className="rounded-md border border-cyan-500/40 bg-black/35 px-3 py-2 text-xs"
                      placeholder="Buyer name"
                    />
                    <input
                      value={crmEditEmail}
                      onChange={(event) => setCrmEditEmail(event.target.value)}
                      className="rounded-md border border-cyan-500/40 bg-black/35 px-3 py-2 text-xs"
                      placeholder="buyer@email.com"
                    />
                    <textarea
                      value={crmEditProducts}
                      onChange={(event) => setCrmEditProducts(event.target.value)}
                      className="md:col-span-2 h-24 rounded-md border border-cyan-500/40 bg-black/35 px-3 py-2 text-xs"
                      placeholder="Products (one per line or separated by |)"
                    />
                    <input
                      type="number"
                      min="1"
                      value={crmEditAmount}
                      onChange={(event) => setCrmEditAmount(event.target.value)}
                      className="rounded-md border border-cyan-500/40 bg-black/35 px-3 py-2 text-xs"
                      placeholder="Total amount"
                    />
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => { void handleSaveCrmEdit(); }} className="cyber-btn cyber-btn-primary">Save Edit</button>
                      <button type="button" onClick={() => { void handleCrmDecision('approve'); }} className="cyber-btn cyber-btn-secondary">Approve</button>
                      <button type="button" onClick={() => { void handleCrmDecision('reject'); }} className="cyber-btn cyber-btn-secondary border-red-400/60 text-red-200 hover:text-white">Cancel Link</button>
                    </div>
                    <button
                      type="button"
                      onClick={() => { void handleArchiveSelectedCrm(); }}
                      className="cyber-btn cyber-btn-secondary"
                    >
                      Archive
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
            {crmError ? (
              <div className="mb-3 rounded-md border border-red-400/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                CRM sync error: {crmError}
              </div>
            ) : null}
            {/* Grouped by buyer */}
            {(() => {
              // Group filteredCrmItems by buyerEmail
              const grouped = new Map<string, typeof filteredCrmItems>();
              for (const item of filteredCrmItems) {
                const key = item.buyerEmail.toLowerCase();
                if (!grouped.has(key)) grouped.set(key, []);
                grouped.get(key)!.push(item);
              }
              // Sort each group newest-first
              for (const [, rows] of grouped) {
                rows.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
              }
              // Sort groups by latest transaction (newest first)
              const sortedGroups = [...grouped.entries()].sort(
                ([, a], [, b]) => new Date(b[0].submittedAt).getTime() - new Date(a[0].submittedAt).getTime()
              );

              if (sortedGroups.length === 0) {
                return (
                  <div className="rounded-lg border border-cyan-500/20 px-4 py-6 text-xs text-cyan-200">
                    No CRM records found. Try Refresh CRM or use Sync Inbox + CRM.
                  </div>
                );
              }

              return (
                <div className="space-y-2 max-h-[560px] overflow-auto">
                  {sortedGroups.map(([emailKey, rows]) => {
                    const latest = rows[0];
                    const totalSpend = rows.reduce((s, r) => s + r.totalAmount, 0);
                    const isExpanded = expandedCrmUser === emailKey;
                    const statusColor = latest.status === 'approved'
                      ? 'border-emerald-400/40 text-emerald-200'
                      : latest.status === 'rejected'
                        ? 'border-red-400/40 text-red-200'
                        : 'border-amber-400/40 text-amber-200';

                    return (
                      <div key={emailKey} className="rounded-lg border border-cyan-500/20 bg-black/30">
                        {/* Buyer row — click to expand */}
                        <button
                          type="button"
                          onClick={() => setExpandedCrmUser(isExpanded ? null : emailKey)}
                          className="w-full flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-left hover:bg-cyan-500/5 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-bold text-cyan-100">{latest.buyerName}</span>
                            <span className="text-[10px] text-cyan-400/70">{latest.buyerEmail}</span>
                            <span className="text-[10px] font-mono text-cyan-500/60">{rows.length} order{rows.length > 1 ? 's' : ''}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-mono text-cyan-100">{toPhp(totalSpend)}</span>
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase ${statusColor}`}>
                              {latest.status}
                            </span>
                            <span className="text-[10px] text-cyan-500">{isExpanded ? '▲' : '▼'}</span>
                          </div>
                        </button>

                        {/* Expanded transaction list */}
                        {isExpanded && (
                          <div className="border-t border-cyan-500/15 px-4 pb-3 pt-2 space-y-2">
                            <p className="text-[10px] font-mono uppercase tracking-widest text-cyan-400/60 mb-2">Transaction History — {latest.buyerName}</p>
                            {rows.map((tx) => {
                              const txColor = tx.status === 'approved'
                                ? 'border-emerald-400/20 text-emerald-200'
                                : tx.status === 'rejected'
                                  ? 'border-red-400/20 text-red-200'
                                  : 'border-amber-400/20 text-amber-200';
                              return (
                                <div key={tx.id} className="rounded-md border border-cyan-500/15 bg-cyan-500/5 px-3 py-2">
                                  <div className="flex flex-wrap items-start justify-between gap-1">
                                    <div className="flex items-start gap-2 flex-1">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setSelectedCrmRecordId(tx.id);
                                          setCrmEditorOpen(false);
                                          setCrmEditName(tx.buyerName);
                                          setCrmEditEmail(tx.buyerEmail);
                                          setCrmEditProducts(tx.products.join('\n'));
                                          setCrmEditAmount(String(tx.totalAmount));
                                          setCrmEditorOpen(true);
                                        }}
                                        className="flex-1 text-left text-xs text-gray-200 hover:text-cyan-200"
                                      >
                                        {tx.products.join(' • ')}
                                      </button>
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                      <span className="text-xs font-mono text-cyan-100">{toPhp(tx.totalAmount)}</span>
                                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase ${txColor}`}>{tx.status}</span>
                                    </div>
                                  </div>
                                  <p className="mt-1 text-[10px] text-cyan-400/50 font-mono">{toReadableDate(tx.submittedAt)} · {tx.referenceCode}</p>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </section>
        ) : null}
      </main>
    </div>
  );
}
