/**
 * Public facts about the site and the business, read from environment variables so the owner fills
 * them in once (Vercel → Settings → Environment Variables) and every page, the footer, the legal
 * texts, the sitemap and the structured data pick them up. Nothing here is invented: a value that
 * is not set is `undefined`, and the legal pages show an explicit `[COMPLETAR_…]` marker instead.
 *
 * Server-side only (the values are read at request time, so changing one needs a redeploy at most,
 * never a rebuild of client code). See .env.example for each variable.
 */

type Env = Readonly<Record<string, string | undefined>>;

export const SITE_NAME = 'Reventa Segura';
export const SITE_TAGLINE = 'Entradas de reventa en Panamá';
/** Home description: 120–160 characters is what search results show without cutting it. */
export const SITE_DESCRIPTION =
  'Compra y vende entradas de reventa en Panamá con pago protegido: el dinero se retiene y el vendedor cobra después del evento.';

const LOCAL_ORIGIN = 'http://localhost:3000';

const clean = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

/**
 * Canonical origin of the site (no trailing slash): SITE_URL, else the production domain Vercel
 * provides, else localhost. It feeds metadataBase, canonical links, the sitemap and the www → apex
 * redirect, so set SITE_URL to the one version of the domain you want indexed.
 */
export function siteUrl(env: Env = process.env): string {
  const explicit = clean(env.SITE_URL);
  const vercel = clean(env.VERCEL_PROJECT_PRODUCTION_URL);
  const candidate = explicit ?? (vercel ? `https://${vercel}` : undefined);
  if (candidate) {
    try {
      const url = new URL(/^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`);
      return url.origin;
    } catch {
      // Fall through to the local origin: a malformed value must not break every page.
    }
  }
  return LOCAL_ORIGIN;
}

/** True when the origin comes from configuration (SITE_URL or Vercel), not from the localhost fallback. */
export function isSiteUrlConfigured(env: Env = process.env): boolean {
  return siteUrl(env) !== LOCAL_ORIGIN;
}

export function absoluteUrl(path: string, env: Env = process.env): string {
  return `${siteUrl(env)}${path.startsWith('/') ? path : `/${path}`}`;
}

// ---- Business data and contact channels -----------------------------------------------------------

export interface BusinessInfo {
  /** Razón social, as registered (e.g. "Nombre S.E."). */
  legalName?: string;
  /** RUC (taxpayer number). */
  ruc?: string;
  /** Registered address. */
  address?: string;
  email?: string;
  /** As the owner wrote it ("+507 6123-4567"); use telHref() for the link. */
  phone?: string;
  /** Digits only, with country code and no "+" (the wa.me format). */
  whatsapp?: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function businessInfo(env: Env = process.env): BusinessInfo {
  const email = clean(env.CONTACT_EMAIL);
  const phone = clean(env.CONTACT_PHONE);
  const whatsappDigits = clean(env.WHATSAPP_NUMBER)?.replace(/\D/g, '');
  return {
    legalName: clean(env.BUSINESS_LEGAL_NAME),
    ruc: clean(env.BUSINESS_RUC),
    address: clean(env.BUSINESS_ADDRESS),
    email: email && EMAIL.test(email) ? email : undefined,
    phone: phone && phone.replace(/\D/g, '').length >= 7 ? phone : undefined,
    whatsapp: whatsappDigits && /^\d{8,15}$/.test(whatsappDigits) ? whatsappDigits : undefined,
  };
}

export const telHref = (phone: string): string => `tel:${phone.trim().startsWith('+') ? '+' : ''}${phone.replace(/\D/g, '')}`;

export const mailtoHref = (email: string, subject?: string): string =>
  subject ? `mailto:${email}?subject=${encodeURIComponent(subject)}` : `mailto:${email}`;

export const whatsappHref = (digits: string, message?: string): string =>
  message ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}` : `https://wa.me/${digits}`;

export interface SocialLink {
  name: 'Instagram' | 'Facebook' | 'X' | 'TikTok';
  url: string;
}

/** Only accounts the owner configured, and only https URLs: an empty variable means "no such account". */
export function socialLinks(env: Env = process.env): SocialLink[] {
  const entries: [SocialLink['name'], string | undefined][] = [
    ['Instagram', env.SOCIAL_INSTAGRAM],
    ['Facebook', env.SOCIAL_FACEBOOK],
    ['X', env.SOCIAL_X],
    ['TikTok', env.SOCIAL_TIKTOK],
  ];
  const links: SocialLink[] = [];
  for (const [name, raw] of entries) {
    const value = clean(raw);
    if (!value) continue;
    try {
      const url = new URL(value);
      if (url.protocol === 'https:') links.push({ name, url: url.toString() });
    } catch {
      // Not a URL: skipped.
    }
  }
  return links;
}

/** Explicit marker for a fact the owner has not provided yet; the legal pages print it as is. */
export const todoMarker = (name: string): string => `[COMPLETAR_${name}]`;

/** The value, or its `[COMPLETAR_…]` marker. */
export const orTodo = (value: string | undefined, name: string): string => value ?? todoMarker(name);

// ---- Search engines and analytics -----------------------------------------------------------------

/** Verification codes for Google Search Console and Bing Webmaster Tools (the "meta tag" method). */
export function siteVerification(env: Env = process.env): { google?: string; bing?: string } {
  return { google: clean(env.GOOGLE_SITE_VERIFICATION), bing: clean(env.BING_SITE_VERIFICATION) };
}

/** Google Analytics 4 measurement id ("G-XXXXXXXXXX"), or undefined: no analytics at all. */
export function analyticsId(env: Env = process.env): string | undefined {
  const id = clean(env.ANALYTICS_GA4_ID);
  return id && /^G-[A-Z0-9]{4,16}$/.test(id) ? id : undefined;
}
