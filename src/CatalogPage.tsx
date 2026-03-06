import { useMemo, useState } from 'react';
import { ArrowLeft, Search, ChevronDown, Sparkles, ShoppingCart, X } from 'lucide-react';
import { productCatalog, type ProductItem } from './data/products';

type CatalogTab = 'all' | 'software' | 'games' | 'courses' | 'others';
type SortKey = 'az' | 'price-low' | 'price-high' | 'newest';

const TAB_ITEMS: Array<{ id: CatalogTab; label: string; accent: string }> = [
  { id: 'all', label: 'All', accent: 'text-cyan-200' },
  { id: 'software', label: 'Software', accent: 'text-fuchsia-200' },
  { id: 'games', label: 'Games', accent: 'text-amber-200' },
  { id: 'courses', label: 'Courses', accent: 'text-emerald-200' },
  { id: 'others', label: 'Others', accent: 'text-sky-200' },
];

const SORT_ITEMS: Array<{ id: SortKey; label: string }> = [
  { id: 'az', label: 'A-Z' },
  { id: 'price-low', label: 'Price: Low to High' },
  { id: 'price-high', label: 'Price: High to Low' },
  { id: 'newest', label: 'Newest' },
];

const COURSE_TOKENS = ['course', 'courses', 'bootcamp', 'training', 'lesson', 'tutorial', 'class', 'masterclass'];
const GAME_TOKENS = ['call of duty', 'nba', 'motogp', 'spider-man', 'sekiro', 'starcraft', 'cities', 'red dead', 'game', 'gta', 'valorant', 'dota', 'cs'];

const getCatalogGroup = (product: ProductItem): CatalogTab => {
  const name = String(product.name ?? '').toLowerCase();
  const category = String(product.category ?? '').toLowerCase();
  if (category.includes('course') || COURSE_TOKENS.some((token) => name.includes(token))) return 'courses';
  if (category.includes('game') || GAME_TOKENS.some((token) => name.includes(token))) return 'games';
  if (!name || name.length < 3) return 'others';
  return category && category !== 'general' ? 'software' : 'software';
};

const getBadges = (product: ProductItem, isFeatured: boolean) => {
  const group = getCatalogGroup(product);
  const badges: string[] = [];
  if (group === 'courses') badges.push('Course');
  if (isFeatured) badges.push('New');
  return badges;
};

export default function CatalogPage() {
  const [activeTab, setActiveTab] = useState<CatalogTab>('all');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('az');
  const [visibleCount, setVisibleCount] = useState(18);
  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(null);

  const featured = useMemo(() => productCatalog.slice(0, 8), []);
  const courseCount = useMemo(() => productCatalog.filter((item) => getCatalogGroup(item) === 'courses').length, []);

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    let items = productCatalog;

    if (activeTab !== 'all') {
      items = items.filter((item) => getCatalogGroup(item) === activeTab);
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
            {TAB_ITEMS.map((tab) => (
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
                <span className={activeTab === tab.id ? tab.accent : ''}>{tab.label}</span>
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
                onClick={() => setSelectedProduct(item)}
                className="min-w-[220px] rounded-2xl border border-fuchsia-500/30 bg-[#120c1f]/70 p-4 text-left shadow-[0_0_20px_rgba(255,0,255,0.1)] transition hover:border-fuchsia-400/70"
              >
                <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.2em] text-fuchsia-200">
                  <Sparkles size={12} /> Featured
                </div>
                <p className="mt-2 text-sm font-semibold text-white line-clamp-2">{item.name}</p>
                <p className="mt-2 text-xs text-cyan-200">PHP {item.amount}</p>
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

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleProducts.map((item, index) => {
              const isFeatured = index < 6 && activeTab === 'all' && !search;
              const badges = getBadges(item, isFeatured);

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
                      onClick={() => setSelectedProduct(item)}
                      className="text-[10px] font-mono uppercase tracking-[0.25em] text-fuchsia-200 hover:text-white"
                    >
                      View Details
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          {filteredProducts.length === 0 && (
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

        {courseCount === 0 && (
          <section className="mt-8 rounded-2xl border border-emerald-500/30 bg-[#031513]/70 p-6 shadow-[0_0_30px_rgba(16,185,129,0.15)]">
            <p className="text-[10px] font-mono uppercase tracking-[0.35em] text-emerald-200">Courses Incoming</p>
            <h3 className="mt-2 text-xl font-semibold text-white">Course modules ready to launch</h3>
            <p className="mt-2 text-sm text-emerald-100/80">
              Pag ready na yung course drops, auto-ready na yung UI tab mo dito. We can light up this section with featured bundles.
            </p>
          </section>
        )}
      </main>

      {selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-10">
          <div className="w-full max-w-md rounded-2xl border border-cyan-500/40 bg-[#0b111f] p-6 shadow-[0_0_40px_rgba(0,243,255,0.2)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-cyan-300">Product Preview</p>
                <h3 className="mt-2 text-lg font-semibold text-white">{selectedProduct.name}</h3>
                <p className="mt-2 text-sm text-cyan-200">PHP {selectedProduct.amount}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedProduct(null)}
                className="rounded-full border border-white/10 p-2 text-gray-300 hover:text-white"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
            <p className="mt-4 text-sm text-gray-300">
              Secure access, verified checkout, and instant unlock once payment clears. Perfect for your next release drop.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <a href="/" className="cyber-btn cyber-btn-primary text-[10px]">
                <ShoppingCart size={14} /> Go to Checkout
              </a>
              <button
                type="button"
                onClick={() => setSelectedProduct(null)}
                className="cyber-btn cyber-btn-secondary text-[10px]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
