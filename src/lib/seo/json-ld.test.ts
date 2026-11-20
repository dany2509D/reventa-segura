import { describe, expect, it } from 'vitest';
import { eventLd, faqLd, organizationLd, serializeJsonLd, websiteLd } from './json-ld';

const env = { SITE_URL: 'https://reventa.example' };

describe('serializeJsonLd', () => {
  it('never lets a value close the script tag', () => {
    const out = serializeJsonLd({ name: '</script><script>alert(1)</script>' });
    expect(out).not.toContain('<');
    expect(JSON.parse(out).name).toBe('</script><script>alert(1)</script>');
  });
});

describe('organizationLd', () => {
  it('lists only what is configured', () => {
    const bare = organizationLd({ social: [], env });
    expect(bare).toMatchObject({ '@type': 'Organization', url: 'https://reventa.example/', logo: 'https://reventa.example/icons/icon-512.png' });
    expect(bare).not.toHaveProperty('sameAs');
    expect(bare).not.toHaveProperty('contactPoint');
  });

  it('adds profiles and a contact point when they exist', () => {
    const full = organizationLd({
      legalName: 'Reventa Segura, S.E.',
      email: 'hola@reventa.example',
      phone: '+507 6123-4567',
      social: [{ name: 'Instagram', url: 'https://www.instagram.com/reventasegura' }],
      env,
    });
    expect(full.sameAs).toEqual(['https://www.instagram.com/reventasegura']);
    expect(full.contactPoint).toMatchObject({ email: 'hola@reventa.example', telephone: '+507 6123-4567' });
    expect(full.legalName).toBe('Reventa Segura, S.E.');
  });
});

describe('websiteLd / faqLd / eventLd', () => {
  it('describes the site in Spanish and points at its publisher', () => {
    expect(websiteLd(env)).toMatchObject({ '@type': 'WebSite', inLanguage: 'es-PA', publisher: { '@id': 'https://reventa.example/#organization' } });
  });

  it('turns questions and answers into a FAQPage', () => {
    const ld = faqLd([{ question: '¿Cómo?', answer: 'Así.' }]);
    expect(ld).toMatchObject({
      '@type': 'FAQPage',
      mainEntity: [{ '@type': 'Question', name: '¿Cómo?', acceptedAnswer: { '@type': 'Answer', text: 'Así.' } }],
    });
  });

  it('describes an event without inventing a price', () => {
    const ld = eventLd({ id: 'abc', name: 'Concierto', startsAt: new Date('2026-12-01T01:00:00Z'), venue: 'Atlapa', env });
    expect(ld).toMatchObject({ '@type': 'Event', url: 'https://reventa.example/eventos/abc', startDate: '2026-12-01T01:00:00.000Z' });
    expect(ld).not.toHaveProperty('offers');
  });
});
