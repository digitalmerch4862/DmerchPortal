import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Search, ChevronDown, Sparkles, ShoppingCart, X, Eye, CheckCircle2, Download, Star, Filter, ArrowUpDown } from 'lucide-react';
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

const normalizeCatalogCategory = (rawCategory: unknown) => {
  const normalized = String(rawCategory ?? '').trim().toLowerCase();
  if (!normalized) return 'Software';
  if (normalized === 'game' || normalized === 'games' || normalized.includes('gaming')) return 'Games';
  if (normalized === 'subscription' || normalized === 'subscriptions' || normalized.includes('subscript')) return 'Subscription';
  if (normalized === 'ebook' || normalized === 'ebooks') return 'EBOOKS';
  if (normalized === 'course' || normalized === 'courses') return 'COURSE';
  if (normalized === 'software' || normalized === 'softwares') return 'Software';
  return String(rawCategory ?? '').trim();
};

const getBadges = (product: ProductItem, isFeatured: boolean) => {
  const badges: string[] = [];
  if (product.category) badges.push(product.category);
  if (isFeatured) badges.push('New');
  if (product.amount > 500) badges.push('Premium');
  return badges;
};

const getPlaceholderImage = (product: ProductItem) => {
  if (product.image_url) return product.image_url;

  const name = (product.name ?? '').toLowerCase();
  
  // High-priority local assets
  if (name.includes('adobe') || name.includes('photoshop') || name.includes('illustrator') || name.includes('premiere')) {
    return '/assets/placeholders/software.png';
  }
  if (name.includes('office') || name.includes('microsoft') || name.includes('acrobat') || name.includes('foxit')) {
    return '/assets/placeholders/software.png';
  }
  if (name.includes('bundle') || name.includes('collection')) {
    return '/assets/placeholders/bundle.png';
  }
  if (name.includes('course') || name.includes('launch') || name.includes('masterclass')) {
    return '/assets/placeholders/course.png';
  }
  if (name.includes('ebook') || name.includes('.epub') || name.includes('.pdf') || name.includes('story')) {
    return '/assets/placeholders/ebook.png';
  }

  // Gaming specialty (Unsplash)
  if (name.includes('gaming') || name.includes('cod') || name.includes('nba') || name.includes('moto') || name.includes('spider-man') || name.includes('sekiro') || name.includes('starcraft')) {
    return 'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=600&auto=format&fit=crop';
  }
  
  // Dynamic Tech Fallback based on product name hash
  const hash = Array.from(name).reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const techImages = [
    'https://images.unsplash.com/photo-1550751827-4bd374c3f58b', // Cyber blue tech
    'https://images.unsplash.com/photo-1518770660439-4636190af475', // Hardware purple
    'https://images.unsplash.com/photo-1451187580459-43490279c0fa', // Data globe
    'https://images.unsplash.com/photo-1558494949-ef010cbdcc48', // Servers
    'https://images.unsplash.com/photo-1531297484001-80022131f5a1', // Silicon
    'https://images.unsplash.com/photo-1485827404703-89b55fcc595e', // Robot
    'https://images.unsplash.com/photo-1519389950473-47ba0277781c', // Dev desk
    'https://images.unsplash.com/photo-1460925895917-afdab827c52f' // Analytics
  ];
  
  const techImg = techImages[hash % techImages.length];
  return `${techImg}?q=80&w=600&auto=format&fit=crop`;
};

const StarRating = ({ rating, reviews }: { rating: number; reviews: number }) => {
  return (
    <div className="flex items-center gap-1">
      <div className="flex items-center">
        {[...Array(5)].map((_, i) => (
          <Star
            key={i}
            size={12}
            className={i < Math.floor(rating) ? "fill-amber-400 text-amber-400" : "text-gray-600"}
          />
        ))}
      </div>
      <span className="text-[10px] text-gray-400">({reviews})</span>
    </div>
  );
};

export default function CatalogPage() {
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<CatalogTab>(ALL_TAB);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('az');
  const [visibleCount, setVisibleCount] = useState(18);
  const [addedProducts, setAddedProducts] = useState<Set<string>>(new Set());
  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(null);

  useEffect(() => {
    let mounted = true;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setIsLoading(false);
      return () => undefined;
    }

    const fetchProducts = async () => {
      let allProducts: any[] = [];
      let pageNum = 0;
      const PAGE_SIZE = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('products')
          .select('name, price, category, sub_category, file_url, image_url')
          .order('name', { ascending: true })
          .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1);

        if (!mounted) return;

        if (error) {
          setIsLoading(false);
          return;
        }

        if (data && data.length > 0) {
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

      if (!mounted) return;
      setProducts(allProducts.map((item) => ({
        name: String(item.name ?? '').trim(),
        amount: Number(item.price || 0),
        category: normalizeCatalogCategory(item.category),
        sub_category: item.sub_category || undefined,
        fileLink: item.file_url || undefined,
        image_url: item.image_url || undefined,
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
      selectedMethod: 'paymongo',
      paymentPortalUsed: 'paymongo',
      paymongoReference: draft.paymongoReference ?? '',
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

        <div className="mt-8 flex flex-col gap-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div className="flex flex-wrap gap-2">
              {tabItems.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab.id);
                    setVisibleCount(18);
                  }}
                  className={`rounded-full border px-5 py-2 text-[11px] font-semibold transition-all ${activeTab === tab.id
                    ? 'border-cyan-400 bg-cyan-500/10 text-cyan-50 shadow-[0_0_15px_rgba(0,243,255,0.2)]'
                    : 'border-white/10 bg-white/5 text-gray-400 hover:border-white/20 hover:bg-white/10'
                    }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <div className="relative flex-1 md:w-64">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-cyan-400/70" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Seach catalog..."
                  className="w-full rounded-full border border-white/10 bg-white/5 py-2 pl-9 pr-4 text-xs text-white outline-none focus:border-cyan-400/50 focus:bg-white/10 transition-all"
                />
              </div>
              <div className="relative">
                <select
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value as SortKey)}
                  className="appearance-none rounded-full border border-white/10 bg-white/5 py-2 pl-4 pr-10 text-[11px] text-gray-300 outline-none focus:border-cyan-400/50 focus:bg-white/10 transition-all cursor-pointer"
                >
                  {SORT_ITEMS.map((item) => (
                    <option key={item.id} value={item.id} className="bg-[#050505]">{item.label}</option>
                  ))}
                </select>
                <ArrowUpDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span className="font-semibold text-white">{filteredProducts.length}+</span> 
            <span>relevant drops discovered in the cyberrealm</span>
            <span className="text-[10px] opacity-50 px-2 py-0.5 border border-white/10 rounded">v2.5.0-catalog</span>
          </div>
        </div>

        <section className="mt-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-mono uppercase tracking-[0.35em] text-cyan-300">Featured Drops</h2>
            <span className="text-[10px] uppercase tracking-[0.3em] text-fuchsia-200">Live</span>
          </div>
          <div className="mt-3 flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
            {featured.map((item) => {
              const img = getPlaceholderImage(item);
              return (
                <button
                  key={item.name}
                  type="button"
                  onClick={() => setSelectedProduct(item)}
                  className="min-w-[240px] group overflow-hidden rounded-2xl border border-fuchsia-500/30 bg-[#120c1f]/70 text-left shadow-[0_0_20px_rgba(255,0,255,0.1)] transition hover:border-fuchsia-400/70"
                >
                  <div className="relative h-32 w-full overflow-hidden">
                    <img src={img} alt={item.name} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#120c1f] to-transparent opacity-60" />
                    <div className="absolute bottom-2 left-3 flex items-center gap-2 text-[9px] font-mono uppercase tracking-[0.2em] text-fuchsia-300">
                      <Sparkles size={10} /> Featured
                    </div>
                  </div>
                  <div className="p-4">
                    <p className="text-sm font-semibold text-white line-clamp-1">{item.name}</p>
                    <p className="mt-1 text-xs text-cyan-200">PHP {item.amount.toLocaleString()}</p>
                    <div className="mt-3 text-[10px] font-mono uppercase tracking-[0.2em] text-cyan-400/70">
                      <span className="inline-flex items-center gap-1"><Eye size={12} /> View Details</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="mt-12">
          {isLoading && (
            <div className="rounded-2xl border border-cyan-500/20 bg-black/50 p-12 text-center">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
              <p className="mt-4 text-sm font-mono text-cyan-300 tracking-widest uppercase">Initializing Catalog Feed...</p>
            </div>
          )}

          <div className="grid gap-x-5 gap-y-10 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visibleProducts.map((item, index) => {
              const isAdded = addedProducts.has(`${item.name}::${item.amount}`);
              const placeholderImg = getPlaceholderImage(item);
              const rating = 4.8 + (index % 3) * 0.1;
              const reviewCount = 850 + (index % 150) * 12;
              const originalPrice = Math.round(item.amount * (2.5 + (index % 3)));
              const discount = Math.round(((originalPrice - item.amount) / originalPrice) * 100);

              return (
                <article
                  key={`${item.name}-${index}`}
                  className="group relative flex flex-col cyber-catalog-card"
                >
                  <div 
                    className="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-[#121c2e] cursor-pointer cyber-image-glow"
                    onClick={() => setSelectedProduct(item)}
                  >
                    <img
                      src={placeholderImg}
                      alt={item.name}
                      className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
                    />
                    <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleAddToCart(item); }}
                      className={`absolute bottom-3 right-3 h-10 w-10 flex items-center justify-center rounded-full border shadow-xl transition-all ${
                        isAdded 
                        ? 'bg-emerald-500 border-emerald-400 text-white' 
                        : 'bg-white border-white/20 text-gray-900 scale-0 group-hover:scale-100'
                      } hover:scale-110 active:scale-95`}
                    >
                      {isAdded ? <CheckCircle2 size={20} /> : <ShoppingCart size={20} />}
                    </button>

                    {index % 5 === 0 && (
                      <div className="absolute top-2 left-2 px-2 py-0.5 bg-amber-400 text-gray-900 text-[10px] font-bold rounded shadow-lg uppercase tracking-wider">
                        Bestseller
                      </div>
                    )}
                  </div>

                  <div className="mt-3 flex flex-col gap-1.5">
                    <h3 
                      className="text-[13px] font-medium leading-tight text-gray-100 line-clamp-2 cursor-pointer hover:text-cyan-400 transition-colors"
                      onClick={() => setSelectedProduct(item)}
                    >
                      {item.name}
                    </h3>

                    <p className="text-[11px] text-gray-500">Verified by DigitalMerch</p>

                    <StarRating rating={rating} reviews={reviewCount} />

                    <div className="mt-1 flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-emerald-400">PHP {item.amount.toLocaleString()}</span>
                      <span className="text-[11px] text-gray-500 line-through">PHP {originalPrice.toLocaleString()}</span>
                      <span className="text-[11px] text-emerald-500/80">({discount}% off)</span>
                    </div>

                    <div className="mt-1 flex items-center gap-1.5 text-cyan-400/80">
                      <Download size={12} strokeWidth={2.5} />
                      <span className="text-[11px] font-bold tracking-tight">Digital Download</span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {!isLoading && filteredProducts.length === 0 && (
            <div className="mt-12 text-center py-20 border border-dashed border-white/5 rounded-3xl">
              <Search className="mx-auto text-gray-600 mb-4" size={40} />
              <p className="text-gray-400 italic">No signals found for your search query...</p>
            </div>
          )}

          {hasMore && (
            <div className="mt-16 flex justify-center">
              <button
                type="button"
                onClick={() => setVisibleCount((current) => current + 18)}
                className="group relative px-10 py-3 rounded-full border border-cyan-500/30 bg-cyan-500/5 text-cyan-100 text-xs font-bold uppercase tracking-widest hover:bg-cyan-500/10 transition-all hover:shadow-[0_0_20px_rgba(0,243,255,0.15)]"
              >
                Sync More Results
                <div className="absolute inset-0 rounded-full border border-cyan-500/50 scale-110 opacity-0 group-hover:scale-100 group-hover:opacity-100 transition-all duration-300" />
              </button>
            </div>
          )}
        </section>
      </main>

      {selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4 py-10">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-cyan-500/40 bg-[#0b111f] shadow-[0_0_60px_rgba(0,243,255,0.25)] flex flex-col sm:flex-row">
            <div className="w-full sm:w-1/2 h-64 sm:h-auto overflow-hidden bg-[#121c2e]">
              <img 
                src={getPlaceholderImage(selectedProduct)} 
                alt={selectedProduct.name} 
                className="h-full w-full object-cover"
              />
            </div>
            <div className="flex-1 p-6 flex flex-col">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-cyan-300">Product Analysis</p>
                  <h3 className="mt-2 text-xl font-black uppercase italic text-white leading-tight">{selectedProduct.name}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedProduct(null)}
                  className="rounded-full border border-white/10 p-2 text-gray-400 hover:text-white hover:bg-white/5 transition-all"
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="mt-4 space-y-3">
                <div className="flex items-center gap-4">
                  <span className="text-2xl font-black text-emerald-400">PHP {selectedProduct.amount.toLocaleString()}</span>
                  <span className="px-2 py-0.5 rounded border border-cyan-500/30 bg-cyan-500/5 text-[10px] font-bold text-cyan-300 uppercase tracking-widest">
                    {selectedProduct.category || 'Digital'}
                  </span>
                </div>
                
                <p className="text-sm text-gray-400 leading-relaxed">
                  High-integrity digital fulfillment. Verified asset with instant unlock protocol. Secure your license below.
                </p>

                <div className="pt-4 border-t border-white/5 flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <CheckCircle2 size={14} className="text-emerald-500" />
                    <span>Malware scanned & verified</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Download size={14} className="text-cyan-400" />
                    <span>Infinite cloud downloads</span>
                  </div>
                </div>
              </div>

              <div className="mt-auto pt-6 flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => handleAddToCart(selectedProduct)}
                  className="w-full py-4 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 text-black font-black uppercase text-xs tracking-[0.2em] shadow-[0_0_20px_rgba(0,243,255,0.3)] hover:shadow-[0_0_30px_rgba(0,243,255,0.5)] hover:scale-[1.02] active:scale-95 transition-all"
                >
                  Acquire Asset
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedProduct(null)}
                  className="w-full py-3 rounded-xl border border-white/10 text-gray-400 font-bold uppercase text-[10px] tracking-widest hover:bg-white/5 transition-all"
                >
                  Discard
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
