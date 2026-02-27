import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, BarChart3, CheckCircle2, Inbox, PackageSearch, ShieldAlert, Trash2, Upload, UsersRound } from 'lucide-react';
import { productCatalog } from './data/products';
import { getSupabaseBrowserClient } from './lib/supabase-browser';

type AdminProduct = {
  id: string;
  name: string;
  amount: number;
  os: string;
  fileLink: string;
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
const ALLOWED_ADMIN_EMAILS = new Set(['rad4862@gmail.com', 'digitalmerch4862@gmail.com']);

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
    })).filter((item) => item.name.length > 0 && Number.isFinite(item.amount));
  } catch {
    return [];
  }
};

const toSeedProducts = () => {
  return productCatalog.slice(0, 120).map((item, index) => ({
    id: `seed-${index + 1}`,
    name: item.name,
    amount: item.amount,
    os: inferOs(item.name),
    fileLink: '',
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
    // Default OS to 'Multi' or infer, default amount to 99
    const os = String(parts[2] ?? '').trim() || inferOs(name);
    const amountStr = String(parts[3] ?? '').trim();
    const amount = amountStr ? Number(amountStr) : 99;

    if (!name || Number.isNaN(amount)) {
      continue;
    }

    imported.push({
      id: `import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      amount,
      os,
      fileLink,
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

type AdminTab = 'analytics' | 'approvals' | 'products' | 'crm';

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
  const [crmSearch, setCrmSearch] = useState('');
  const [crmStatusFilter, setCrmStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [massAmount, setMassAmount] = useState('');
  const [massOs, setMassOs] = useState('');
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

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setLoginError('Missing Supabase browser credentials. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
      setAuthChecking(false);
      return;
    }

    const fetchSupabaseProducts = async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('name');

      if (!error && data) {
        setProducts(data.map(p => ({
          id: p.id,
          name: p.name,
          amount: Number(p.price || 0),
          os: p.os || inferOs(p.name),
          fileLink: p.file_url || '',
        })));
      }
    };

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

  // No longer using LocalStorage for products
  // useEffect(() => {
  //   window.localStorage.setItem(PRODUCTS_KEY, JSON.stringify(products));
  // }, [products]);

  useEffect(() => {
    window.localStorage.setItem(INBOX_KEY, JSON.stringify(inboxItems));
  }, [inboxItems]);

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return products;
    }
    return products.filter((item) => item.name.toLowerCase().includes(query));
  }, [products, search]);

  const selectedCount = selectedProductIds.length;
  const areAllProductsSelected = products.length > 0 && products.every((item) => selectedProductIds.includes(item.id));

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

    if (Object.keys(updateMap).length > 0) {
      await supabase.from('products').update(updateMap).eq('id', id);
    }
  };

  const removeProduct = async (id: string) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setProducts((current) => current.filter((item) => item.id !== id));
    setSelectedProductIds((current) => current.filter((itemId) => itemId !== id));
    await supabase.from('products').delete().eq('id', id);
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

  const selectAllProducts = () => {
    if (areAllProductsSelected) {
      return;
    }
    setSelectedProductIds(products.map((item) => item.id));
  };

  const clearSelectedProducts = () => {
    setSelectedProductIds([]);
  };

  const applyMassAmount = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const parsed = Number(massAmount);
    if (Number.isNaN(parsed)) {
      return;
    }
    setProducts((current) => current.map((item) => (selectedProductIds.includes(item.id) ? { ...item, amount: parsed } : item)));
    await supabase.from('products').update({ price: parsed }).in('id', selectedProductIds);
    setMassAmount('');
  };

  const applyMassOs = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const nextOs = massOs.trim();
    if (!nextOs) {
      return;
    }
    setProducts((current) => current.map((item) => (selectedProductIds.includes(item.id) ? { ...item, os: nextOs } : item)));
    await supabase.from('products').update({ os: nextOs }).in('id', selectedProductIds);
    setMassOs('');
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
    setProducts((current) => current.filter((item) => !selectedProductIds.includes(item.id)));
    await supabase.from('products').delete().in('id', selectedProductIds);
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
      setInboxItems((current) => current.map((row) => (row.id === item.id ? { ...row, status: nextStatus } : row)));
      setCrmItems((current) => current.map((row) => (row.referenceCode === item.referenceCode ? { ...row, status: nextStatus } : row)));

      if (action === 'approve') {
        alert(`Successfully approved ${item.referenceCode}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Review action failed';
      alert(`Approval Error: ${message}`);
    } finally {
      setProcessingId(null);
    }
  };

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
      const response = await fetch('/api/admin-inbox-clear', {
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

  const analyticsCards = useMemo(() => {
    const now = new Date();
    const approvedItems = crmItems.filter((item) => item.status === 'approved');

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
  }, [crmItems]);

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
            <button onClick={() => { void refreshAdminData(); }} className="cyber-btn cyber-btn-secondary whitespace-nowrap">
              {inboxLoading || crmLoading ? 'Syncing...' : 'Sync Inbox + CRM'}
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
                return (
                  <article key={card.key} className="rounded-lg border border-cyan-500/20 bg-black/35 p-3">
                    <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-cyan-300">{card.title}</p>
                    <p className="mt-2 text-xl font-black text-cyan-100">{toPhp(card.currentSales)}</p>
                    <p className="mt-1 text-xs text-cyan-200">Previous: {toPhp(card.previousSales)}</p>
                    <p className={`mt-1 text-xs ${isPositive ? 'text-emerald-300' : 'text-red-300'}`}>
                      {isPositive ? '+' : '-'}{toPhp(Math.abs(card.delta))} ({card.percentChange === null ? 'N/A' : `${card.percentChange >= 0 ? '+' : ''}${card.percentChange.toFixed(1)}%`})
                    </p>
                    <p className="mt-2 text-[11px] font-mono uppercase tracking-[0.18em] text-cyan-100">Evaluation: {card.evaluation}</p>
                  </article>
                );
              })}
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
                <button onClick={() => { void clearInbox(); }} className="cyber-btn cyber-btn-secondary">Clear Inbox</button>
              </div>
            </div>
            <p className="mb-3 text-[11px] font-mono uppercase tracking-[0.16em] text-cyan-200">
              Last sync: {lastInboxSyncAt ? toReadableDate(lastInboxSyncAt) : 'Never'} | Rows fetched: {inboxLastCount}
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
            <section className="rounded-xl border border-cyan-500/30 bg-[#041019]/80 p-4 sm:p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.2em] text-cyan-300"><PackageSearch size={14} />Products Manager</p>
                <div className="flex gap-2">
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    className="rounded-md border border-cyan-500/40 bg-black/35 px-3 py-2 text-xs"
                    placeholder="Search file name"
                  />
                  <button onClick={() => { void addProductRow(); }} className="cyber-btn cyber-btn-primary">Add Product</button>
                  <button onClick={() => { void migrateProductsToSupabase(); }} className="cyber-btn cyber-btn-secondary border-amber-500/40 text-amber-200">
                    <Upload size={14} /> Migrate Local
                  </button>
                </div>
              </div>
              <div className="mb-3 flex flex-wrap gap-2 rounded-md border border-cyan-500/20 bg-black/25 p-2">
                <button onClick={selectAllProducts} className="cyber-btn cyber-btn-secondary">Select All</button>
                <button onClick={clearSelectedProducts} className="cyber-btn cyber-btn-secondary">Remove Selected All</button>
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
                  value={massOs}
                  onChange={(event) => setMassOs(event.target.value)}
                  className="rounded-md border border-cyan-500/40 bg-black/35 px-3 py-2 text-xs"
                  placeholder="Mass OS"
                />
                <button disabled={selectedCount === 0} onClick={applyMassOs} className="cyber-btn cyber-btn-secondary">Mass Edit OS</button>
                <button disabled={selectedCount === 0} onClick={deleteSelectedProducts} className="cyber-btn cyber-btn-secondary">Mass Delete</button>
              </div>
              <div className="max-h-[420px] overflow-auto rounded-lg border border-cyan-500/20">
                <table className="w-full min-w-[980px] border-collapse text-xs">
                  <thead className="bg-cyan-500/10 text-cyan-200">
                    <tr>
                      <th className="px-2 py-2 text-center"></th>
                      <th className="px-2 py-2 text-left">File Name</th>
                      <th className="px-2 py-2 text-left">File Link</th>
                      <th className="px-2 py-2 text-left">OS</th>
                      <th className="px-2 py-2 text-right">Amount</th>
                      <th className="px-2 py-2 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.map((item) => (
                      <tr key={item.id} className="border-t border-cyan-500/15">
                        <td className="px-2 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => toggleSelectProduct(item.id)}
                            className={`inline-flex h-5 w-5 items-center justify-center rounded-full border ${selectedProductIds.includes(item.id) ? 'border-cyan-300 bg-cyan-400/20' : 'border-cyan-500/35'}`}
                            aria-label="Select row"
                          >
                            {selectedProductIds.includes(item.id) ? <span className="h-2 w-2 rounded-full bg-cyan-300" /> : null}
                          </button>
                        </td>
                        <td className="px-2 py-2">
                          <input value={item.name} onChange={(event) => updateProduct(item.id, { name: event.target.value })} className="w-full rounded border border-cyan-500/30 bg-black/35 px-2 py-1" />
                        </td>
                        <td className="px-2 py-2">
                          <input value={item.fileLink} onChange={(event) => updateProduct(item.id, { fileLink: event.target.value })} className="w-full rounded border border-cyan-500/30 bg-black/35 px-2 py-1" placeholder="https://drive.google.com/..." />
                        </td>
                        <td className="px-2 py-2">
                          <input value={item.os} onChange={(event) => updateProduct(item.id, { os: event.target.value })} className="w-full rounded border border-cyan-500/30 bg-black/35 px-2 py-1" />
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
            </section>

            <section className="rounded-xl border border-cyan-500/30 bg-[#041019]/80 p-4 sm:p-5">
              <p className="mb-2 inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.2em] text-cyan-300"><Upload size={14} />Bulk Upload (CSV/TSV Paste)</p>
              <p className="mb-3 text-xs text-cyan-100/80">Format: <span className="font-mono">File Name, File Link, Operating System, Amount</span>. Amount is optional and defaults to 99.</p>
              <textarea
                value={bulkData}
                onChange={(event) => setBulkData(event.target.value)}
                className="h-28 w-full rounded-md border border-cyan-500/35 bg-black/40 p-3 text-xs"
                placeholder="Adobe Photoshop 2025 v26.0 for Windows(OS),https://drive.google.com/file/d/.../view,Windows,99"
              />
              <div className="mt-3 flex justify-end">
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
              </div>
            </div>
            <p className="mb-3 text-[11px] font-mono uppercase tracking-[0.16em] text-cyan-200">
              Last sync: {lastCrmSyncAt ? toReadableDate(lastCrmSyncAt) : 'Never'} | Rows fetched: {crmLastCount}
            </p>
            {crmError ? (
              <div className="mb-3 rounded-md border border-red-400/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                CRM sync error: {crmError}
              </div>
            ) : null}
            <div className="max-h-[560px] overflow-auto rounded-lg border border-cyan-500/20">
              <table className="w-full min-w-[1080px] border-collapse text-xs">
                <thead className="bg-cyan-500/10 text-cyan-200">
                  <tr>
                    <th className="px-2 py-2 text-left">Username</th>
                    <th className="px-2 py-2 text-left">Email</th>
                    <th className="px-2 py-2 text-left">Purchased Products</th>
                    <th className="px-2 py-2 text-right">Total Amount</th>
                    <th className="px-2 py-2 text-center">Latest Status</th>
                    <th className="px-2 py-2 text-left">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCrmItems.length === 0 ? (
                    <tr className="border-t border-cyan-500/15">
                      <td className="px-3 py-4 text-cyan-200" colSpan={6}>No CRM records found. Try Refresh CRM or use Sync Inbox + CRM.</td>
                    </tr>
                  ) : filteredCrmItems.map((item) => (
                    <tr key={item.id} className="border-t border-cyan-500/15">
                      <td className="px-2 py-2 text-cyan-100">{item.buyerName}</td>
                      <td className="px-2 py-2 text-cyan-100">{item.buyerEmail}</td>
                      <td className="px-2 py-2 text-gray-200">{item.products.join(' | ')}</td>
                      <td className="px-2 py-2 text-right text-cyan-100">{toPhp(item.totalAmount)}</td>
                      <td className="px-2 py-2 text-center">
                        <span className={`rounded-full border px-2 py-1 text-[10px] font-mono uppercase ${item.status === 'pending' ? 'border-amber-400/40 text-amber-200' : item.status === 'approved' ? 'border-emerald-400/40 text-emerald-200' : 'border-red-400/40 text-red-200'}`}>
                          {item.status}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-cyan-100">{toReadableDate(item.submittedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
