export const PROMO_CARDS_KEY = 'dmerch_promo_cards_v1';

export type PromoCard = {
  title: string;
  imageUrl: string;
  href: string;
};

export const DEFAULT_PROMO_CARDS: PromoCard[] = [
  { title: 'Promo Slot 1', imageUrl: '', href: '' },
  { title: 'Promo Slot 2', imageUrl: '', href: '' },
  { title: 'Promo Slot 3', imageUrl: '', href: '' },
];

export const sanitizePromoCards = (raw: unknown): PromoCard[] => {
  const source = Array.isArray(raw) ? raw : [];
  const next = [...DEFAULT_PROMO_CARDS];
  for (let i = 0; i < next.length; i += 1) {
    const item = source[i];
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    next[i] = {
      title: String(record.title ?? `Promo Slot ${i + 1}`).trim() || `Promo Slot ${i + 1}`,
      imageUrl: String(record.imageUrl ?? '').trim(),
      href: String(record.href ?? '').trim(),
    };
  }
  return next;
};

export const readPromoCardsFromStorage = (): PromoCard[] => {
  if (typeof window === 'undefined') return [...DEFAULT_PROMO_CARDS];
  try {
    const raw = window.localStorage.getItem(PROMO_CARDS_KEY);
    if (!raw) return [...DEFAULT_PROMO_CARDS];
    return sanitizePromoCards(JSON.parse(raw));
  } catch {
    return [...DEFAULT_PROMO_CARDS];
  }
};
