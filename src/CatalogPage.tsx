import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Search, ChevronDown, Sparkles, ShoppingCart } from 'lucide-react';
import { type ProductItem } from './data/products';
import { getSupabaseBrowserClient } from './lib/supabase-browser';

type CatalogTab = string;
type SortKey = 'az' | 'price-low' | 'price-high' | 'newest';
const ALL_TAB = 'all';
const CHECKOUT_DRAFT_KEY = 'dmerch_checkout_draft_v1';

const SORT_ITEMS: Array<{ id: SortKey; label: string }> = [
  { id: 'az', label: 'A-Z' },
  { id: 'price-low', label: 'Price: Low to High' },
  { id: 'price-high', label: 'Price: High to Low' },
  { id: 'newest', label: 'Newest' },
];

const getBadges = (product: ProductItem, isFeatured: boolean) => {
  const badges: string[] = [];
  if (product.category) badges.push(product.category);
  if (isFeatured) badges.push('New');
  return badges;
};

export default function CatalogPage() {
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<CatalogTab>(ALL_TAB);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('az');
  const [visibleCount, setVisibleCount] = useState(18);
  const [addedProducts, setAddedProducts] = useState<Set<string>>(new Set());

  useEffect(() => {
    let mounted = true;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setIsLoading(false);
      return () => undefined;
    }

    const fetchProducts = async () => {
      const { data, error } = await supabase
        .from('products')
        .select('name, price, category, sub_category, file_url')
        .order('name');

      if (!mounted) return;
      if (error || !data) {
        setIsLoading(false);
        return;
      }

      setProducts(data.map((item) => ({
        name: String(item.name ?? '').trim(),
        amount: Number(item.price || 0),
        category: item.category || undefined,
        sub_category: item.sub_category || undefined,
        fileLink: item.file_url || undefined,
      })));
      setIsLoading(false);
    };

    void fetchProducts();

    const channel = supabase
      .channel('products-catalog')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
        void fetchProducts();
      })
      .subscribe();

    return () => {
      mounted = false;
      void supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    const rawDraft = window.localStorage.getItem(CHECKOUT_DRAFT_KEY);
    if (!rawDraft) {
      return;
    }
    try {
      const parsed = JSON.parse(rawDraft) as { selectedProducts?: ProductItem[] };
      const names = new Set(
        Array.isArray(parsed.selectedProducts)
          ? parsed.selectedProducts.map((item) => `${item.name}::${item.amount}`)
          : []
      );
      setAddedProducts(names);
    } catch {
      setAddedProducts(new Set());
    }
  }, []);

  const featured = useMemo(() => products.slice(0, 8), [products]);

  const categories = useMemo(() => {
    const unique = new Set<string>();
    products.forEach((item) => {
      const category = String(item.category ?? '').trim();
      if (category) {
        unique.add(category);
      }
    });
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [products]);

  const tabItems = useMemo(() => {
    return [{ id: ALL_TAB, label: 'All' }, ...categories.map((label) => ({ id: label, label }))];
  }, [categories]);

  useEffect(() => {
    if (activeTab !== ALL_TAB && !categories.includes(activeTab)) {
      setActiveTab(ALL_TAB);
    }
  }, [activeTab, categories]);

  const handleAddToCart = (product: ProductItem) => {
    const key = `${product.name}::${product.amount}`;
    setAddedProducts((current) => new Set(current).add(key));

    const rawDraft = window.localStorage.getItem(CHECKOUT_DRAFT_KEY);
    let draft: any = {};
    if (rawDraft) {
      try {
        draft = JSON.parse(rawDraft) ?? {};
      } catch {
        draft = {};
      }
    }

    const selectedProducts = Array.isArray(draft.selectedProducts) ? draft.selectedProducts : [];
    const exists = selectedProducts.some((item: ProductItem) => item.name === product.name && Number(item.amount) === Number(product.amount));
    const nextProducts = exists
      ? selectedProducts
      : [...selectedProducts, { name: product.name, amount: product.amount }];

    window.localStorage.setItem(CHECKOUT_DRAFT_KEY, JSON.stringify({
      username: draft.username ?? '',
      email: draft.email ?? '',
      referenceNo: draft.referenceNo ?? '',
      selectedMethod: draft.selectedMethod ?? 'gcash',
      paymentPortalUsed: draft.paymentPortalUsed ?? 'gcash',
      gcashNumberUsed: draft.gcashNumberUsed ?? '',
      gotymeAccountNameUsed: draft.gotymeAccountNameUsed ?? '',
      selectedProducts: nextProducts,
    }));
  };

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    let items = products;

    if (activeTab !== ALL_TAB) {
      items = items.filter((item) => String(item.category ?? '').trim() === activeTab);
    }

    if (query) {
      items = items.filter((item) => item.name.toLowerCase().includes(query));
    }

    const sorted = [...items];
    if (sortKey === 'az') {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortKey === 'price-low') {
      sorted.sort((a, b) => (a.amount ?? 0) - (b.amount ?? 0));
    } else if (sortKey === 'price-high') {
      sorted.sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0));
    }

    return sorted;
  }, [activeTab, search, sortKey]);

  const visibleProducts = filteredProducts.slice(0, visibleCount);
  const hasMore = visibleCount < filteredProducts.length;

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans overflow-x-hidden">
      <div
        className="fixed inset-0 z-0 opacity-25 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(0,243,255,0.16) 1px, transparent 1px), linear-gradient(90deg, rgba(0,243,255,0.12) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />
      <div className="fixed inset-0 z-0 bg-gradient-to-b from-transparent via-black/60 to-black pointer-events-none" />

      <main className="relative z-10 mx-auto max-w-6xl px-4 py-10 sm:py-14">
        <header className="flex flex-col gap-5 rounded-2xl border border-cyan-500/30 bg-[#0b111f]/70 p-6 shadow-[0_0_40px_rgba(0,243,255,0.12)] sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.4em] text-cyan-300">DMERCH // CATALOG</p>
            <h1 className="mt-2 text-3xl font-black uppercase italic text-white sm:text-4xl">
              Live Drops + Course Launch Pad
            </h1>
            <p className="mt-2 max-w-xl text-sm text-cyan-100/80">
              Secure catalog view, cyber-styled cards, at ready na for your upcoming course releases.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <a href="/" className="cyber-btn cyber-btn-secondary text-[10px]">
              <ArrowLeft size={14} /> Back to Portal
            </a>
            <a href="/" className="cyber-btn cyber-btn-primary text-[10px]">
              <ShoppingCart size={14} /> Checkout
            </a>
          </div>
        </header>

        <section className="mt-6 rounded-2xl border border-fuchsia-500/30 bg-[#0a0f1d]/70 p-5 shadow-[0_0_30px_rgba(255,0,255,0.12)]">
          <div className="grid gap-4 lg:grid-cols-[1.4fr_0.6fr]">
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-cyan-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search products, bundles, course packs..."
                className="w-full rounded-xl border border-cyan-500/30 bg-black/50 py-3 pl-10 pr-4 text-sm text-white outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-400/30"
              />
            </div>
            <label className="relative">
              <span className="sr-only">Sort</span>
              <select
                value={sortKey}
                onChange={(event) => setSortKey(event.target.value as SortKey)}
                className="w-full appearance-none rounded-xl border border-cyan-500/30 bg-black/50 py-3 pl-4 pr-10 text-sm text-white outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-400/30"
              >
                {SORT_ITEMS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
              <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-cyan-400" />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {tabItems.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                  setVisibleCount(18);
                }}
                className={`rounded-full border px-4 py-2 text-[10px] font-mono uppercase tracking-[0.3em] transition ${activeTab === tab.id
                  ? 'border-cyan-400 bg-cyan-500/15 text-cyan-100 shadow-[0_0_18px_rgba(0,243,255,0.35)]'
                  : 'border-white/10 bg-black/40 text-gray-400 hover:border-cyan-400/40 hover:text-cyan-200'
                  }`}
              >
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="mt-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-mono uppercase tracking-[0.35em] text-cyan-300">Featured Drops</h2>
            <span className="text-[10px] uppercase tracking-[0.3em] text-fuchsia-200">Live</span>
          </div>
          <div className="mt-3 flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
            {featured.map((item) => (
              <button
                key={item.name}
                type="button"
                onClick={() => handleAddToCart(item)}
                className="min-w-[220px] rounded-2xl border border-fuchsia-500/30 bg-[#120c1f]/70 p-4 text-left shadow-[0_0_20px_rgba(255,0,255,0.1)] transition hover:border-fuchsia-400/70"
              >
                <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.2em] text-fuchsia-200">
                  <Sparkles size={12} /> Featured
                </div>
                <p className="mt-2 text-sm font-semibold text-white line-clamp-2">{item.name}</p>
                <p className="mt-2 text-xs text-cyan-200">PHP {item.amount}</p>
                <div className="mt-3 text-[10px] font-mono uppercase tracking-[0.2em] text-cyan-200">
                  {addedProducts.has(`${item.name}::${item.amount}`) ? (
                    <span className="inline-flex items-center gap-1"><ShoppingCart size={12} /> Added</span>
                  ) : (
                    'Add to cart'
                  )}
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="mt-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-mono uppercase tracking-[0.35em] text-cyan-300">Product Grid</h2>
            <span className="text-[10px] uppercase tracking-[0.3em] text-gray-400">
              {filteredProducts.length} items
            </span>
          </div>

          {isLoading && (
            <div className="mt-4 rounded-2xl border border-cyan-500/20 bg-black/50 p-6 text-center text-sm text-gray-400">
              Syncing catalog...
            </div>
          )}

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleProducts.map((item, index) => {
              const isFeatured = index < 6 && activeTab === ALL_TAB && !search;
              const badges = getBadges(item, isFeatured);
              const isAdded = addedProducts.has(`${item.name}::${item.amount}`);

              return (
                <article
                  key={`${item.name}-${index}`}
                  className="flex h-full flex-col justify-between rounded-2xl border border-white/10 bg-[#060a14]/80 p-4 shadow-[0_0_24px_rgba(0,0,0,0.35)] transition hover:border-cyan-400/60"
                >
                  <div>
                    {badges.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {badges.map((badge) => (
                          <span
                            key={badge}
                            className="rounded-full border border-cyan-400/30 px-2 py-0.5 text-[9px] font-mono uppercase tracking-[0.2em] text-cyan-200"
                          >
                            {badge}
                          </span>
                        ))}
                      </div>
                    )}
                    <h3 className="mt-3 text-sm font-semibold text-white line-clamp-2">{item.name}</h3>
                    <p className="mt-2 text-xs text-gray-400">Secure Access • Live Catalog</p>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-xs font-mono uppercase tracking-[0.2em] text-cyan-200">PHP {item.amount}</span>
                    <button
                      type="button"
                      onClick={() => handleAddToCart(item)}
                      className={`text-[10px] font-mono uppercase tracking-[0.25em] ${isAdded ? 'text-cyan-200' : 'text-fuchsia-200 hover:text-white'}`}
                    >
                      {isAdded ? (
                        <span className="inline-flex items-center gap-1"><ShoppingCart size={12} /> Added</span>
                      ) : (
                        'Add to cart'
                      )}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          {!isLoading && filteredProducts.length === 0 && (
            <div className="mt-6 rounded-2xl border border-cyan-500/20 bg-black/50 p-6 text-center text-sm text-gray-400">
              No products match that search yet.
            </div>
          )}

          {hasMore && (
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={() => setVisibleCount((current) => current + 18)}
                className="cyber-btn cyber-btn-secondary text-[10px]"
              >
                Load more
              </button>
            </div>
          )}
        </section>

      </main>

      
    </div>
  );
}
