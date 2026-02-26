import {useEffect, useMemo, useState} from 'react';
import {motion} from 'motion/react';
import {ArrowLeft, CheckCircle2, Inbox, PackageSearch, ShieldAlert, Trash2, Upload} from 'lucide-react';
import {productCatalog} from './data/products';

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
  totalDownloads?: number;
};

const ADMIN_USERNAME = 'RAD';
const ADMIN_EMAIL = 'DMERCHPAYMENTPORTAL';
const ADMIN_UNLOCK_KEY = 'dmerch_admin_unlocked';
const PRODUCTS_KEY = 'dmerch_admin_products_v1';
const INBOX_KEY = 'dmerch_admin_inbox_v1';
const ADMIN_HEADERS = {
  'X-Admin-User': ADMIN_USERNAME,
  'X-Admin-Key': ADMIN_EMAIL,
};

const inferOs = (name: string) => {
  const lower = name.toLowerCase();
  if (lower.includes('windows')) return 'Windows';
  if (lower.includes('mac')) return 'macOS';
  if (lower.includes('android') || lower.includes('.apk')) return 'Android';
  return 'Multi';
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

const toSeedInbox = (): InboxItem[] => [
  {
    id: 'DMERCH-2026FEB26-011',
    buyerName: 'John R.',
    buyerEmail: 'johnr@example.com',
    referenceCode: 'DMERCH-2026FEB26-011',
    submittedAt: new Date().toISOString(),
    products: ['Adobe Premiere Pro 2025 v25.0 (x64) for Windows(OS)'],
    status: 'pending',
    deliveryLink: '',
  },
  {
    id: 'DMERCH-2026FEB26-012',
    buyerName: 'Mia T.',
    buyerEmail: 'miat@example.com',
    referenceCode: 'DMERCH-2026FEB26-012',
    submittedAt: new Date(Date.now() - 1000 * 60 * 9).toISOString(),
    products: ['CANVA PREMIUM LIFE TIME'],
    status: 'pending',
    deliveryLink: '',
  },
];

const parseBulkRows = (raw: string): AdminProduct[] => {
  const rows = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const imported: AdminProduct[] = [];
  for (const row of rows) {
    const parts = row.includes('\t') ? row.split('\t') : row.split(',');
    if (parts.length < 2) {
      continue;
    }

    const name = String(parts[0] ?? '').trim();
    const fileLink = String(parts[1] ?? '').trim();
    const os = String(parts[2] ?? '').trim() || inferOs(name);
    const amount = Number(String(parts[3] ?? '').trim() || '99');

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

export default function Admin() {
  const [loginUser, setLoginUser] = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginError, setLoginError] = useState('');
  const [unlocked, setUnlocked] = useState(false);

  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [inboxItems, setInboxItems] = useState<InboxItem[]>([]);
  const [bulkData, setBulkData] = useState('');
  const [search, setSearch] = useState('');
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [massAmount, setMassAmount] = useState('');
  const [massOs, setMassOs] = useState('');
  const [inboxLoading, setInboxLoading] = useState(false);

  useEffect(() => {
    const isUnlocked = window.sessionStorage.getItem(ADMIN_UNLOCK_KEY) === '1';
    setUnlocked(isUnlocked);

    const storedProducts = window.localStorage.getItem(PRODUCTS_KEY);
    const storedInbox = window.localStorage.getItem(INBOX_KEY);

    if (storedProducts) {
      setProducts(JSON.parse(storedProducts) as AdminProduct[]);
    } else {
      const seeded = toSeedProducts();
      setProducts(seeded);
      window.localStorage.setItem(PRODUCTS_KEY, JSON.stringify(seeded));
    }

    if (storedInbox) {
      setInboxItems(JSON.parse(storedInbox) as InboxItem[]);
    } else {
      const seeded = toSeedInbox();
      setInboxItems(seeded);
      window.localStorage.setItem(INBOX_KEY, JSON.stringify(seeded));
    }
  }, []);

  useEffect(() => {
    if (products.length === 0) {
      return;
    }
    window.localStorage.setItem(PRODUCTS_KEY, JSON.stringify(products));
  }, [products]);

  useEffect(() => {
    if (inboxItems.length === 0) {
      return;
    }
    window.localStorage.setItem(INBOX_KEY, JSON.stringify(inboxItems));
  }, [inboxItems]);

  useEffect(() => {
    if (!unlocked) {
      return;
    }
    void refreshInbox();
  }, [unlocked]);

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return products;
    }
    return products.filter((item) => item.name.toLowerCase().includes(query));
  }, [products, search]);

  const pendingCount = useMemo(() => inboxItems.filter((item) => item.status === 'pending').length, [inboxItems]);

  const handleUnlock = () => {
    const valid = loginUser.trim().toUpperCase() === ADMIN_USERNAME && loginEmail.trim().toUpperCase() === ADMIN_EMAIL;
    if (!valid) {
      setLoginError('Invalid admin credentials.');
      return;
    }

    setLoginError('');
    setUnlocked(true);
    window.sessionStorage.setItem(ADMIN_UNLOCK_KEY, '1');
    void refreshInbox();
  };

  const updateProduct = (id: string, patch: Partial<AdminProduct>) => {
    setProducts((current) => current.map((item) => (item.id === id ? {...item, ...patch} : item)));
  };

  const removeProduct = (id: string) => {
    setProducts((current) => current.filter((item) => item.id !== id));
    setSelectedProductIds((current) => current.filter((itemId) => itemId !== id));
  };

  const addProductRow = () => {
    setProducts((current) => [
      {
        id: `manual-${Date.now()}`,
        name: 'New Product',
        amount: 99,
        os: 'Windows',
        fileLink: '',
      },
      ...current,
    ]);
  };

  const applyBulkImport = () => {
    const imported = parseBulkRows(bulkData);
    if (imported.length === 0) {
      return;
    }
    setProducts((current) => [...imported, ...current]);
    setBulkData('');
  };

  const updateInbox = (id: string, patch: Partial<InboxItem>) => {
    setInboxItems((current) => current.map((item) => (item.id === id ? {...item, ...patch} : item)));
  };

  const selectedCount = selectedProductIds.length;
  const areAllFilteredSelected = filteredProducts.length > 0 && filteredProducts.every((item) => selectedProductIds.includes(item.id));

  const toggleSelectProduct = (id: string) => {
    setSelectedProductIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const toggleSelectAllFiltered = () => {
    if (areAllFilteredSelected) {
      setSelectedProductIds((current) => current.filter((id) => !filteredProducts.some((item) => item.id === id)));
      return;
    }

    const merged = new Set<string>(selectedProductIds);
    filteredProducts.forEach((item) => merged.add(item.id));
    setSelectedProductIds(Array.from(merged));
  };

  const applyMassAmount = () => {
    const parsed = Number(massAmount);
    if (Number.isNaN(parsed)) {
      return;
    }
    setProducts((current) => current.map((item) => (selectedProductIds.includes(item.id) ? { ...item, amount: parsed } : item)));
    setMassAmount('');
  };

  const applyMassOs = () => {
    const nextOs = massOs.trim();
    if (!nextOs) {
      return;
    }
    setProducts((current) => current.map((item) => (selectedProductIds.includes(item.id) ? { ...item, os: nextOs } : item)));
    setMassOs('');
  };

  const deleteSelectedProducts = () => {
    if (selectedProductIds.length === 0) {
      return;
    }
    const confirmed = window.confirm(`Delete ${selectedProductIds.length} selected product(s)?`);
    if (!confirmed) {
      return;
    }
    setProducts((current) => current.filter((item) => !selectedProductIds.includes(item.id)));
    setSelectedProductIds([]);
  };

  const refreshInbox = async () => {
    setInboxLoading(true);
    try {
      const response = await fetch('/api/admin-inbox', {
        headers: {
          ...ADMIN_HEADERS,
        },
      });
      const payload = await response.json() as { ok: boolean; inbox?: Array<Omit<InboxItem, 'id' | 'deliveryLink'>>; error?: string };
      if (!response.ok || !payload.ok || !payload.inbox) {
        throw new Error(payload.error ?? 'Could not load inbox');
      }

      setInboxItems(payload.inbox.map((item) => ({
        ...item,
        id: item.referenceCode,
        deliveryLink: '',
      })));
    } catch {
      // Keep local fallback inbox when backend is unreachable.
    } finally {
      setInboxLoading(false);
    }
  };

  const submitReview = async (item: InboxItem, action: 'approve' | 'reject') => {
    const response = await fetch('/api/admin-review', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...ADMIN_HEADERS,
      },
      body: JSON.stringify({
        serialNo: item.referenceCode,
        action,
        deliveryLink: item.deliveryLink,
      }),
    });

    const payload = await response.json() as { ok: boolean; error?: string };
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error ?? 'Review action failed');
    }

    setInboxItems((current) => current.map((row) => (row.id === item.id ? { ...row, status: action === 'approve' ? 'approved' : 'rejected' } : row)));
  };

  const handleLogout = () => {
    window.sessionStorage.removeItem(ADMIN_UNLOCK_KEY);
    setUnlocked(false);
  };

  if (!unlocked) {
    return (
      <div className="min-h-screen bg-[#050505] text-white px-4 py-10">
        <div className="mx-auto max-w-md rounded-xl border border-cyan-500/30 bg-[#071018]/80 p-6">
          <h1 className="text-xl font-black tracking-[0.12em] uppercase text-cyan-200">Admin Portal Access</h1>
          <p className="mt-2 text-sm text-cyan-100/80">Enter admin credentials to unlock the dashboard.</p>
          <div className="mt-5 space-y-3">
            <input
              value={loginUser}
              onChange={(event) => setLoginUser(event.target.value)}
              className="w-full rounded-md border border-cyan-500/40 bg-black/40 px-3 py-2 text-sm"
              placeholder="Username"
            />
            <input
              value={loginEmail}
              onChange={(event) => setLoginEmail(event.target.value)}
              className="w-full rounded-md border border-cyan-500/40 bg-black/40 px-3 py-2 text-sm"
              placeholder="Email key"
            />
            {loginError ? <p className="text-xs text-red-300">{loginError}</p> : null}
            <button onClick={handleUnlock} className="cyber-btn cyber-btn-primary w-full">Unlock Admin</button>
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
              <p className="mt-1 text-xs text-cyan-100/80">Manage deployed products, links, and buyer approvals in one screen.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => { window.location.href = '/'; }} className="cyber-btn cyber-btn-secondary"><ArrowLeft size={14} />Main Portal</button>
              <button onClick={handleLogout} className="cyber-btn cyber-btn-secondary">Logout</button>
            </div>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          <section className="rounded-xl border border-cyan-500/30 bg-[#041019]/80 p-4">
            <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-cyan-300">Pending Approvals</p>
            <p className="mt-2 text-3xl font-black text-cyan-100">{pendingCount}</p>
          </section>
          <section className="rounded-xl border border-cyan-500/30 bg-[#041019]/80 p-4">
            <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-cyan-300">Deployed Products</p>
            <p className="mt-2 text-3xl font-black text-cyan-100">{products.length}</p>
          </section>
          <section className="rounded-xl border border-cyan-500/30 bg-[#041019]/80 p-4">
            <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-cyan-300">Approved Today</p>
            <p className="mt-2 text-3xl font-black text-cyan-100">{inboxItems.filter((item) => item.status === 'approved').length}</p>
          </section>
        </div>

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
              <button onClick={addProductRow} className="cyber-btn cyber-btn-primary">Add Product</button>
            </div>
          </div>

          <div className="mb-3 flex flex-wrap gap-2 rounded-md border border-cyan-500/20 bg-black/25 p-2">
            <button onClick={toggleSelectAllFiltered} className="cyber-btn cyber-btn-secondary">{areAllFilteredSelected ? 'Unselect Filtered' : 'Select Filtered'}</button>
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
                  <th className="px-2 py-2 text-center">Select</th>
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
                      <input
                        value={item.name}
                        onChange={(event) => updateProduct(item.id, {name: event.target.value})}
                        className="w-full rounded border border-cyan-500/30 bg-black/35 px-2 py-1"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        value={item.fileLink}
                        onChange={(event) => updateProduct(item.id, {fileLink: event.target.value})}
                        className="w-full rounded border border-cyan-500/30 bg-black/35 px-2 py-1"
                        placeholder="https://drive.google.com/..."
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        value={item.os}
                        onChange={(event) => updateProduct(item.id, {os: event.target.value})}
                        className="w-full rounded border border-cyan-500/30 bg-black/35 px-2 py-1"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        value={item.amount}
                        onChange={(event) => updateProduct(item.id, {amount: Number(event.target.value || 0)})}
                        className="w-full rounded border border-cyan-500/30 bg-black/35 px-2 py-1 text-right"
                      />
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

        <section className="rounded-xl border border-cyan-500/30 bg-[#041019]/80 p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.2em] text-cyan-300"><Inbox size={14} />Buyer Approval Inbox</p>
            <button onClick={() => { void refreshInbox(); }} className="cyber-btn cyber-btn-secondary">{inboxLoading ? 'Refreshing...' : 'Refresh Inbox'}</button>
          </div>
          <div className="space-y-3">
            {inboxItems.map((item) => (
              <motion.div key={item.id} layout className="rounded-lg border border-cyan-500/20 bg-black/35 p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-cyan-100">{item.referenceCode}</p>
                    <p className="text-xs text-cyan-200">{item.buyerName} ({item.buyerEmail})</p>
                    <p className="mt-1 text-xs text-gray-300">Products: {item.products.join(' | ')}</p>
                  </div>
                  <span className={`rounded-full border px-2 py-1 text-[10px] font-mono uppercase ${item.status === 'pending' ? 'border-amber-400/40 text-amber-200' : item.status === 'approved' ? 'border-emerald-400/40 text-emerald-200' : 'border-red-400/40 text-red-200'}`}>
                    {item.status}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-cyan-300/90">Downloads used (admin): {item.totalDownloads ?? 0}/10</p>

                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                  <input
                    value={item.deliveryLink}
                    onChange={(event) => updateInbox(item.id, {deliveryLink: event.target.value})}
                    className="rounded-md border border-cyan-500/35 bg-black/35 px-3 py-2 text-xs"
                    placeholder="Paste delivery link to send customer"
                  />
                  <button
                    onClick={() => {
                      void submitReview(item, 'approve');
                    }}
                    className="cyber-btn cyber-btn-primary"
                    disabled={!item.deliveryLink.trim()}
                  >
                    <CheckCircle2 size={14} /> Approve
                  </button>
                  <button onClick={() => { void submitReview(item, 'reject'); }} className="cyber-btn cyber-btn-secondary">
                    <ShieldAlert size={14} /> Reject
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
