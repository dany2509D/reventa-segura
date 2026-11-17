import { IconCard, IconLock, IconPhoneCheck } from '../_components/icons';
import { StaggerGrid, StaggerItem } from '../_components/motion-primitives';

// Short, factual guarantees: each one describes what the platform really does (see how-it-works).
const ITEMS = [
  { icon: <IconPhoneCheck />, title: 'Verificación telefónica obligatoria', text: 'Todo vendedor confirma su número.' },
  { icon: <IconLock />, title: 'Pago retenido hasta confirmar acceso', text: 'El vendedor cobra después del evento.' },
  { icon: <IconCard />, title: 'Yappy, ACH y Tarjeta', text: 'Paga con el método que ya usas.' },
];

/** Compact guarantees bar right under the hero. A Server Component; only the cascade is client. */
export default function TrustBar() {
  return (
    <section className="container trust-bar-wrap" aria-label="Garantías">
      <StaggerGrid as="ul" className="trust-bar">
        {ITEMS.map((item) => (
          <StaggerItem as="li" key={item.title} className="trust-item">
            <span className="trust-icon">{item.icon}</span>
            <span className="trust-copy">
              <b>{item.title}</b>
              <span>{item.text}</span>
            </span>
          </StaggerItem>
        ))}
      </StaggerGrid>
    </section>
  );
}
