import { DEFAULT_FEE_BPS } from '@/lib/pricing/pricing';
import { IconArrowRight } from '../_components/icons';
import Magnetic from '../_components/magnetic';

/** Section 04: the other side of the marketplace. One accent block, one (magnetic) call to action. */
export default function SellBand() {
  // The commission comes from the pricing rules, so the sentence cannot drift from the real fee.
  const fee = String(DEFAULT_FEE_BPS / 100).replace('.', ',');
  return (
    <section className="section container" aria-labelledby="vender-title">
      <div className="sell-band reveal">
        <svg className="sell-art" viewBox="0 0 320 220" aria-hidden="true" focusable="false">
          <path d="M24 28H296A14 14 0 0 1 310 42V84A26 26 0 0 0 310 136V178A14 14 0 0 1 296 192H24A14 14 0 0 1 10 178V136A26 26 0 0 0 10 84V42A14 14 0 0 1 24 28Z" />
          <path className="perf" d="M222 40V180" />
          <path d="M44 74H170M44 104H132M44 146H96" />
        </svg>
        <div className="sell-copy">
          <p className="eyebrow">
            <span className="idx">04</span> Para quien vende
          </p>
          <h2 id="vender-title" className="section-title-xl">
            ¿Tienes una entrada que no vas a usar?
          </h2>
          <p className="sell-text">
            Publícala aquí. Verificamos tu identidad, revisamos la publicación antes de mostrarla y cobras después del evento. La comisión
            es del {fee} % de la venta.
          </p>
        </div>
        <Magnetic>
          <a className="btn lg" href="/vender">
            Vender una entrada
            <IconArrowRight />
          </a>
        </Magnetic>
      </div>
    </section>
  );
}
