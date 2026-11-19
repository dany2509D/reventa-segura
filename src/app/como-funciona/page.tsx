import BackLink from '../_components/back-link';
import HowItWorks from '../_home/how-it-works';
import '../_home/home.css';

export const metadata = { title: 'Cómo funciona el escrow' };

export default function HowItWorksPage() {
  return (
    <main className="page wide">
      <BackLink href="/eventos">Explorar eventos</BackLink>
      <HowItWorks asPage />
      <section className="how-cta" aria-label="Acciones">
        <div>
          <h2>¿Listo para comprar o vender sin riesgos?</h2>
          <p>El comprador entra seguro y el vendedor cobra cuando cierra la ventana de reportes.</p>
        </div>
        <div className="actions">
          <a className="btn sm" href="/eventos">
            Explorar eventos
          </a>
          <a className="btn sm secondary" href="/vender">
            Vender una entrada
          </a>
        </div>
      </section>
    </main>
  );
}
