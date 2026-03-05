import { useEffect, useMemo, useState } from 'react';
import { productCatalog, type ProductItem } from './data/products';

const CATEGORY_RULES: [RegExp, string][] = [
  [/(adobe|photoshop|illustrator|indesign|lightroom|premiere|after effects|audition|media encoder|corel|filmora|canva)/i, 'Creative Suite'],
  [/(autodesk|autocad|revit|solidworks|maya|naviswork|lumion|enscape|sketchup|rhino|vray)/i, 'CAD & 3D'],
  [/(office|quickbooks|acrobat|foxit|wps|turbotax)/i, 'Productivity'],
  [/(mcafee|norton|easeus|idm|winrar|partition|virus|utilities)/i, 'Security & Utilities'],
  [/(call of duty|nba|motogp|spider-man|sekiro|starcraft|cities|red dead)/i, 'Gaming'],
  [/(android|apk|pixelcut|mobile)/i, 'Mobile'],
];

const GAMEPLAY_VIDEOS = [
  {
    title: 'DigitalMerch Live Showcase',
    url: 'https://www.youtube.com/embed/5qap5aO4i9A',
    description: 'Official gameplay drop preview para sa entire catalog, curated by the DigitalMerch crew.',
  },
  {
    title: 'Level Up with Studio Tools',
    url: 'https://www.youtube.com/embed/aqz-KE-bpKQ',
    description: 'Behind-the-scenes showcase ng pinaka-hot tools para sa creative squads.',
  },
  {
    title: 'Mission Control Ops Briefing',
    url: 'https://www.youtube.com/embed/bTqVqk7FSmY',
    description: 'Quick briefing kung paano gumagana ang automation sa loob ng catalog at portal.',
  },
];

const HEADLINE_PRODUCTS = productCatalog.slice(0, 6);

type CategorySummary = {
  name: string;
  count: number;
  products: string[];
};

const toCategoryLabel = (name: string) => {
  const rule = CATEGORY_RULES.find(([pattern]) => pattern.test(name));
  return rule ? rule[1] : 'Others';
};

const getCategorySummaries = (products: ProductItem[]): CategorySummary[] => {
  const groups = new Map<string, string[]>();
  for (const product of products) {
    const label = toCategoryLabel(product.name);
    const bucket = groups.get(label) ?? [];
    bucket.push(product.name);
    groups.set(label, bucket);
  }
  return Array.from(groups.entries())
    .map(([name, items]) => ({ name, count: items.length, products: items }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
};

const ProductCard = ({ product }: { product: ProductItem }) => {
  const tag = toCategoryLabel(product.name);

  return (
    <li className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 p-4 shadow-[0_0_25px_rgba(0,0,0,0.25)] transition hover:border-fuchsia-400/70 hover:bg-white/10">
      <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.2em] text-fuchsia-200">
        <span>{tag}</span>
        <span className="text-right font-semibold tracking-[0.1em] text-white">PHP {product.amount}</span>
      </div>
      <p className="text-sm font-semibold leading-snug text-white">{product.name}</p>
      <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Secure Access • Game-ready</p>
    </li>
  );
};

export default function LandingPage() {
  const categorySummaries = useMemo(() => getCategorySummaries(productCatalog), []);
  const topCategories = useMemo(() => categorySummaries.slice(0, 4), [categorySummaries]);
  const [activeCategory, setActiveCategory] = useState<CategorySummary | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const CART_KEY = 'dmerch_cart_products';
  const [cart, setCart] = useState<string[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(CART_KEY);
    if (stored) {
      setCart(JSON.parse(stored));
    }
  }, []);

  const persistCart = (items: string[]) => {
    setCart(items);
    window.localStorage.setItem(CART_KEY, JSON.stringify(items));
  };

  const copyAndAdd = (product: string) => {
    if (typeof window === 'undefined') return;
    window.navigator.clipboard.writeText(product);
    const nextCart = Array.from(new Set([...cart, product]));
    persistCart(nextCart);
  };

  const paymentUrl = cart.length
    ? `https://paymentportal.digitalmerchs.store/?products=${encodeURIComponent(cart.join(','))}`
    : 'https://paymentportal.digitalmerchs.store/';

  const filteredProducts = useMemo(() => {
    if (!activeCategory) return [];
    const normalized = searchQuery.trim().toLowerCase();
    if (!normalized) return activeCategory.products;
    return activeCategory.products.filter((name) => name.toLowerCase().includes(normalized));
  }, [activeCategory, searchQuery]);

  const handleOpenCategory = (category: CategorySummary) => {
    setActiveCategory(category);
    setSearchQuery('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#050510] via-[#050b1f] to-black text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-12 px-4 py-10 sm:py-16">
        <section className="space-y-6 rounded-3xl border border-white/10 bg-[#040812]/70 p-8 shadow-[0_0_30px_rgba(0,0,0,0.8)]">
          <p className="text-xs uppercase tracking-[0.4em] text-fuchsia-300">DigitalMerch Game Catalog</p>
          <div className="space-y-4">
            <h1 className="text-3xl font-bold leading-tight text-white sm:text-5xl">
              Game-ready licenses and toolkits, curated para sa pinaka-epic na playthrough mo.
            </h1>
            <p className="text-sm text-gray-300 sm:text-base">
              Every digital title at utility asset in this catalog is hand-picked, armored with payment verification, and ready to drop into your player page. Pick, checkout, and nab the secure download once Mission Control validates the purchase.
            </p>
            <div className="flex flex-wrap gap-3">
              <a
                className="cyber-btn cyber-btn-primary"
                href="https://paymentportal.digitalmerchs.store/"
                target="_blank"
                rel="noreferrer"
              >
                Visit payment portal
              </a>
              <span className="rounded-full border border-fuchsia-400/60 px-3 py-1 text-[10px] font-mono uppercase tracking-[0.3em] text-fuchsia-200">
                Checkout ensures secure download access
              </span>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <article className="rounded-2xl border border-fuchsia-500/30 bg-[#0d0822]/70 p-4">
              <p className="text-[10px] uppercase tracking-[0.3em] text-fuchsia-200">Catalog</p>
              <p className="mt-2 text-3xl font-bold text-white">{productCatalog.length}</p>
              <p className="text-xs text-gray-300">game-ready assets | ₱99 / ₱199</p>
            </article>
            <article className="rounded-2xl border border-cyan-500/30 bg-[#0a1f2b]/70 p-4">
              <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-200">Runtime</p>
              <p className="mt-2 text-3xl font-bold text-white">24/7</p>
              <p className="text-xs text-gray-300">automation logs + cart sync</p>
            </article>
            <article className="rounded-2xl border border-amber-500/30 bg-[#2a1200]/70 p-4">
              <p className="text-[10px] uppercase tracking-[0.3em] text-amber-200">Downloads</p>
              <p className="mt-2 text-3xl font-bold text-white">Secure</p>
              <p className="text-xs text-gray-300">portal unlock after payment verification</p>
            </article>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-white">Official Gameplay Reels</h2>
          <p className="text-sm text-gray-400">Watch the official gameplay footage we’re distributing across our agents.</p>
          <div className="grid gap-6 md:grid-cols-3">
            {GAMEPLAY_VIDEOS.map((video) => (
              <div key={video.title} className="rounded-2xl border border-white/10 bg-[#030513]/80 p-4 shadow-[0_0_25px_rgba(0,0,0,0.35)]">
                <div className="aspect-video w-full overflow-hidden rounded-xl border border-white/10">
                  <iframe
                    src={`${video.url}?rel=0`}
                    title={video.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="h-full w-full"
                  />
                </div>
                <h3 className="mt-3 text-sm font-semibold text-white">{video.title}</h3>
                <p className="text-xs text-gray-400">{video.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">Cyber catalog categories</h2>
              <p className="text-sm text-gray-400">Hit the card to load the list and add straight to your cart.</p>
            </div>
            <span className="text-xs uppercase tracking-[0.3em] text-cyan-300">Click to view</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {categorySummaries.map((category) => {
              const previewSamples = category.products.slice(0, 3);
              return (
                <button
                  key={category.name}
                  type="button"
                  onClick={() => handleOpenCategory(category)}
                  className="group flex flex-col rounded-2xl border border-white/10 bg-[#05060f]/80 p-4 text-left transition hover:border-fuchsia-400/60"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-200">{category.name}</p>
                    <span className="rounded-full border border-cyan-400/30 px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.2em] text-cyan-200">
                      {category.count}
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-gray-300">
                    {previewSamples.map((sample) => (
                      <p key={sample} className="truncate">{sample}</p>
                    ))}
                  </div>
                  <p className="mt-3 text-[10px] uppercase tracking-[0.4em] text-cyan-300/80">View all</p>
                  <div className="mt-2 h-1 rounded-full bg-transparent transition group-hover:bg-cyan-400/60" />
                </button>
              );
            })}
          </div>
        </section>

        {cart.length > 0 && (
          <section className="space-y-3 rounded-3xl border border-fuchsia-500/40 bg-[#05010a]/70 p-6 shadow-[0_0_30px_rgba(0,0,0,0.7)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.3em] text-fuchsia-200">Shopping cart</p>
                <h4 className="text-xl font-semibold text-white">{cart.length} {cart.length > 1 ? 'items' : 'item'}</h4>
              </div>
              <a
                href={paymentUrl}
                target="_blank"
                rel="noreferrer"
                className="cyber-btn cyber-btn-primary text-[10px] font-semibold uppercase tracking-[0.3em]"
              >
                Checkout
              </a>
            </div>
            <div className="grid gap-3 text-sm text-white/80">
              {cart.map((item) => (
                <div key={item} className="rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-xs font-mono uppercase tracking-[0.2em]">
                  {item}
                </div>
              ))}
            </div>
          </section>
        )}

        {activeCategory && (
          <section className="space-y-6 rounded-3xl border border-cyan-500/40 bg-[#03060f]/60 p-6 shadow-[0_0_40px_rgba(0,0,0,0.55)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-300">{activeCategory.name}</p>
                <h4 className="text-2xl font-semibold text-white">{activeCategory.count} drops</h4>
                <p className="text-xs text-gray-400">Premium {activeCategory.name.toLowerCase()} kits for your rig.</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveCategory(null)}
                className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-200 hover:text-white"
              >
                Close list
              </button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-[10px] uppercase tracking-[0.3em] text-gray-400" htmlFor="category-search">
                Search within this category
              </label>
              <input
                id="category-search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Type a keyword (e.g., Adobe, 2025)"
                className="rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/40 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-300/50"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredProducts.length > 0 ? (
                filteredProducts.map((product) => (
                  <article key={product} className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 shadow-[0_0_25px_rgba(0,0,0,0.2)]">
                    <div className="flex items-center justify-between">
                      <div className="rounded-2xl bg-gradient-to-br from-cyan-500/60 to-blue-500/40 p-3 text-xs font-semibold uppercase tracking-[0.15em] text-white">
                        {activeCategory.name.split(' ')[0].slice(0, 3)}
                      </div>
                      <span className="text-[10px] uppercase tracking-[0.2em] text-gray-300">PHP 99 / 199</span>
                    </div>
                    <h5 className="text-sm font-semibold text-white">{product}</h5>
                    <p className="text-xs text-gray-400">{`Premium ${activeCategory.name.toLowerCase()} toolkit with secure verification.`}</p>
                    <button
                      type="button"
                      onClick={() => copyAndAdd(product)}
                      className="text-[11px] font-mono uppercase tracking-[0.25em] text-cyan-200"
                    >
                      Add to cart
                    </button>
                  </article>
                ))
              ) : (
                <p className="text-xs text-gray-400">No items match that search yet.</p>
              )}
            </div>
          </section>
        )}

        <section className="space-y-3 rounded-2xl border border-fuchsia-500/30 bg-[#0c111d]/80 p-6">
          <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-200">How it works</p>
          <ol className="space-y-3 text-sm leading-relaxed text-gray-300">
            <li>
              <strong className="font-semibold text-white">1.</strong> Pick your assets—237 entries with ₱99/₱199 pricing all ready to drop into your rig.
            </li>
            <li>
              <strong className="font-semibold text-white">2.</strong> Visit <strong className="text-cyan-300">https://paymentportal.digitalmerchs.store/</strong> and settle payment through GCash/GoTyme.
            </li>
            <li>
              <strong className="font-semibold text-white">3.</strong> The payment portal returns a verification token—DigitalMerch automation unlocks the download portal for you.
            </li>
          </ol>
          <p className="text-xs uppercase tracking-[0.3em] text-orange-300">
            NOTE: Links stay hidden until the portal confirms the purchase. No shortcuts.
          </p>
        </section>
      </div>
    </div>
  );
}
