/**
 * Plain-Spanish Panamanian buyer-protection strip ("¿Y si me tumban?") mounted below the seasonal
 * poster wall on the home page. Always rendered on warm cream (#F2EDE4) with dark ink (#0E0E0E).
 */
export default function Garantia() {
  return (
    <section className="section garantia-section container" aria-labelledby="garantia-title">
      <div className="garantia reveal">
        <h2 id="garantia-title" className="garantia-title">
          ¿Y SI ME TUMBAN?
        </h2>
        <p className="garantia-copy">
          No le pagas al vendedor. Guardamos tu plata hasta que entras, y si en la puerta te dicen que no, abres un
          reporte y lo revisamos.{' '}
          <a className="garantia-link" href="/como-funciona">
            Cómo funciona
          </a>
        </p>
      </div>
    </section>
  );
}
