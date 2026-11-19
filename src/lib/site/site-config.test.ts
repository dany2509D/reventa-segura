import { describe, expect, it } from 'vitest';
import {
  absoluteUrl,
  analyticsId,
  businessInfo,
  isSiteUrlConfigured,
  mailtoHref,
  orTodo,
  siteUrl,
  siteVerification,
  socialLinks,
  telHref,
  whatsappHref,
} from './site-config';

describe('siteUrl', () => {
  it('prefers SITE_URL and keeps only the origin', () => {
    expect(siteUrl({ SITE_URL: 'https://reventa.example/inicio/?x=1', VERCEL_PROJECT_PRODUCTION_URL: 'otro.vercel.app' })).toBe('https://reventa.example');
  });

  it('accepts a bare host and falls back to the Vercel production domain', () => {
    expect(siteUrl({ SITE_URL: 'reventa.example' })).toBe('https://reventa.example');
    expect(siteUrl({ VERCEL_PROJECT_PRODUCTION_URL: 'reventa-segura.vercel.app' })).toBe('https://reventa-segura.vercel.app');
  });

  it('falls back to localhost when nothing (or nonsense) is configured', () => {
    expect(siteUrl({})).toBe('http://localhost:3000');
    expect(siteUrl({ SITE_URL: 'http://' })).toBe('http://localhost:3000');
    expect(isSiteUrlConfigured({})).toBe(false);
    expect(isSiteUrlConfigured({ SITE_URL: 'https://reventa.example' })).toBe(true);
  });

  it('builds absolute URLs', () => {
    expect(absoluteUrl('/eventos/1', { SITE_URL: 'https://reventa.example' })).toBe('https://reventa.example/eventos/1');
    expect(absoluteUrl('privacidad', { SITE_URL: 'https://reventa.example' })).toBe('https://reventa.example/privacidad');
  });
});

describe('businessInfo', () => {
  it('returns nothing for variables that are missing or blank', () => {
    expect(businessInfo({ CONTACT_EMAIL: '  ' })).toEqual({
      legalName: undefined,
      ruc: undefined,
      address: undefined,
      email: undefined,
      phone: undefined,
      whatsapp: undefined,
    });
  });

  it('keeps valid values and drops malformed contact channels', () => {
    const info = businessInfo({
      BUSINESS_LEGAL_NAME: 'Reventa Segura, S.E.',
      CONTACT_EMAIL: 'hola@reventa.example',
      CONTACT_PHONE: '+507 6123-4567',
      WHATSAPP_NUMBER: '+507 6123-4567',
    });
    expect(info.legalName).toBe('Reventa Segura, S.E.');
    expect(info.email).toBe('hola@reventa.example');
    expect(info.phone).toBe('+507 6123-4567');
    expect(info.whatsapp).toBe('50761234567');
    expect(businessInfo({ CONTACT_EMAIL: 'no-es-correo', CONTACT_PHONE: '12', WHATSAPP_NUMBER: 'abc' })).toMatchObject({
      email: undefined,
      phone: undefined,
      whatsapp: undefined,
    });
  });

  it('formats tappable links', () => {
    expect(telHref('+507 6123-4567')).toBe('tel:+50761234567');
    expect(telHref('6123-4567')).toBe('tel:61234567');
    expect(mailtoHref('hola@reventa.example')).toBe('mailto:hola@reventa.example');
    expect(mailtoHref('hola@reventa.example', 'Mi orden')).toBe('mailto:hola@reventa.example?subject=Mi%20orden');
    expect(whatsappHref('50761234567')).toBe('https://wa.me/50761234567');
    expect(whatsappHref('50761234567', 'Hola, ¿me ayudan?')).toBe('https://wa.me/50761234567?text=Hola%2C%20%C2%BFme%20ayudan%3F');
  });
});

describe('socialLinks', () => {
  it('lists only configured https accounts', () => {
    const links = socialLinks({
      SOCIAL_INSTAGRAM: 'https://www.instagram.com/reventasegura',
      SOCIAL_FACEBOOK: 'http://facebook.com/inseguro',
      SOCIAL_X: 'no es una url',
      SOCIAL_TIKTOK: '',
    });
    expect(links).toEqual([{ name: 'Instagram', url: 'https://www.instagram.com/reventasegura' }]);
  });
});

describe('placeholders and codes', () => {
  it('prints an explicit marker for a missing fact', () => {
    expect(orTodo(undefined, 'RUC')).toBe('[COMPLETAR_RUC]');
    expect(orTodo('155-123-456', 'RUC')).toBe('155-123-456');
  });

  it('accepts only well-formed analytics ids', () => {
    expect(analyticsId({ ANALYTICS_GA4_ID: 'G-ABC123XYZ9' })).toBe('G-ABC123XYZ9');
    expect(analyticsId({ ANALYTICS_GA4_ID: 'UA-12345-1' })).toBeUndefined();
    expect(analyticsId({})).toBeUndefined();
  });

  it('reads the search-engine verification codes', () => {
    expect(siteVerification({ GOOGLE_SITE_VERIFICATION: ' abc ', BING_SITE_VERIFICATION: '' })).toEqual({ google: 'abc', bing: undefined });
  });
});
