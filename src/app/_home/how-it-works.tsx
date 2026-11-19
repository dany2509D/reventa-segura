import { IconChevronDown } from '../_components/icons';
import ScrollScene from '../_components/scroll-scene';
import { isTestMode } from '../_components/test-mode';

// The copy below describes what the platform actually does today, step by step, and nothing more:
// sellers pass a manual identity check, the team reviews each listing, the buyer's payment is
// held, the seller delivers through the ticketing platform (or as an image), the buyer confirms
// receipt and then entry, and the money goes to the seller only when the dispute window closes
// (12 hours after the event starts). No guarantees are promised beyond that flow.
const STEPS: { title: string; text: string }[] = [
  {
    title: 'Eliges una entrada',
    text: 'Solo publican personas cuya identidad verificó nuestro equipo. Además, revisamos cada publicación antes de mostrarla.',
  },
  {
    title: 'Pagas y el dinero se retiene',
    text: 'Pagas dentro de la plataforma. El dinero no pasa al vendedor: queda retenido mientras se completa la entrega.',
  },
  {
    title: 'Recibes la entrada',
    text: 'El vendedor te la transfiere en la boletera (Panatickets, Ticketplus u otra) o te envía la imagen. Tú confirmas que la recibiste.',
  },
  {
    title: 'Entras al evento',
    text: 'El día del evento confirmas tu ingreso. El pago se libera al vendedor cuando cierra el plazo de reportes, 12 horas después del inicio.',
  },
];

/**
 * Section 03: how a ticket moves from one person to another. Four connected steps; the line
 * that joins them is drawn as the section scrolls through the viewport (ScrollScene 'progress')
 * and is simply complete without JavaScript or with reduced motion.
 */
export default function HowItWorks({ asPage = false }: { asPage?: boolean }) {
  const testMode = isTestMode();
  const TitleTag = asPage ? 'h1' : 'h2';
  return (
    <section className={asPage ? 'how is-page on-scrim' : 'how on-scrim'} id="como-funciona" aria-labelledby="como-title">
      <div className={asPage ? 'how-inner' : 'container'}>
        <header className="section-head reveal">
          <p className="eyebrow">
            <span className="idx">Escrow</span> Cómo funciona
          </p>
          <TitleTag id="como-title" className="section-title-xl">
            El vendedor cobra después del evento, no antes.
          </TitleTag>
          <p className="section-desc">Así pasa una entrada de una persona a otra en Reventa Segura.</p>
        </header>

        <ScrollScene mode="progress" className="how-track">
          <span className="how-line" aria-hidden="true">
            <span className="how-line-fill" />
          </span>
          <ol className="how-steps">
            {STEPS.map((step, i) => (
              <li key={step.title} className={`how-step how-step-${i} reveal reveal-${i}`}>
                <span className="how-node" aria-hidden="true">
                  <span className="how-node-fill" />
                  <span className="how-node-num">{String(i + 1).padStart(2, '0')}</span>
                </span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
        </ScrollScene>

        <div className="how-faq">
          <div className="how-faq-lead reveal">
            <h3>Preguntas frecuentes</h3>
            <p>Cómo protegemos tu compra en escrow y cómo manejamos reportes o restricciones del evento.</p>
            {testMode ? (
              <div className="how-note is-status">
                <h3>Estado actual: modo de prueba</h3>
                <p>Los pagos funcionan con una pasarela de prueba. Aún no se cobra dinero real.</p>
              </div>
            ) : null}
          </div>
          <div className="faq-list reveal reveal-1">
            <details className="faq-item" open>
              <summary className="faq-trigger">
                <span>¿Cuándo recibe el dinero el vendedor?</span>
                <IconChevronDown />
              </summary>
              <p className="faq-answer">
                El pago queda retenido en la plataforma durante la entrega y hasta 12 horas después del inicio del evento, cuando cierra el plazo de reportes sin incidencias.
              </p>
            </details>
            <details className="faq-item">
              <summary className="faq-trigger">
                <span>¿Qué pasa si algo sale mal en la puerta?</span>
                <IconChevronDown />
              </summary>
              <p className="faq-answer">
                Abres una disputa desde Mis órdenes hasta 12 horas después del inicio del evento. El equipo revisa tu caso y, si procede, te devuelve el dinero.
              </p>
            </details>
            <details className="faq-item">
              <summary className="faq-trigger">
                <span>¿Todas las boleteras permiten entradas revendidas?</span>
                <IconChevronDown />
              </summary>
              <p className="faq-answer">
                Una boletera o un recinto puede restringir la reventa; cuando un organizador la prohíbe explícitamente, bloqueamos publicaciones para ese evento. Si te rechazan en la puerta, abre una disputa.
              </p>
            </details>
          </div>
        </div>
      </div>
    </section>
  );
}
