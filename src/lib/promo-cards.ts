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

export const resolvePromoImageUrl = (rawUrl: string): string => {
  const input = String(rawUrl ?? '').trim();
  if (!input) return '';

  const fromFilePath = input.match(/\/file\/d\/([^/?]+)/i)?.[1];
  const fromOpenId = input.match(/[?&]id=([^&]+)/i)?.[1];
  const fileId = fromFilePath || fromOpenId || '';
  if (fileId) {
    return `https://drive.google.com/thumbnail?id=${fileId}&sz=w2000`;
  }

  return input;
};
