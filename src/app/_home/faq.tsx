import { faqItems } from '@/lib/site/faq';
import { businessInfo, mailtoHref } from '@/lib/site/site-config';
import './faq.css';

/**
 * Frequently asked questions, at the very end of the home page. Native <details> elements: they
 * open and close with the keyboard and work without JavaScript. The same list feeds the page's
 * FAQPage structured data (see page.tsx), so what search engines read is what visitors see.
 */
export default function Faq() {
  const { email } = businessInfo();
  return (
    <section className="faq container" id="preguntas" aria-labelledby="faq-title">
      <div className="faq-panel">
        <header className="faq-head">
          <p className="eyebrow">Preguntas frecuentes</p>
          <h2 id="faq-title" className="faq-title">
            Lo que más nos preguntan
          </h2>
        </header>
        <div className="faq-list">
          {faqItems().map((item) => (
            <details key={item.question} className="faq-item">
              <summary>{item.question}</summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
        <p className="faq-more">
          ¿Tu duda no está aquí? Mira los <a href="/terminos">términos</a> y los <a href="/reembolsos">reembolsos y garantías</a>
          {email ? (
            <>
              {' '}
              o escríbenos a <a href={mailtoHref(email)}>{email}</a>
            </>
          ) : null}
          .
        </p>
      </div>
    </section>
  );
}
