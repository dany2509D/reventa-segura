import type { Metadata } from 'next';
import { analyticsId } from '@/lib/site/site-config';
import { pageMetadata } from '@/lib/seo/metadata';
import CookiePreferencesButton from '../_components/cookie-preferences-button';
import { LegalPage, LegalSection, type LegalSectionDef } from '../_pages/legal';

export const metadata: Metadata = pageMetadata({
  title: 'Política de cookies',
  description:
    'Qué cookies y almacenamiento usa Reventa Segura, para qué sirve cada uno, cuánto duran y cómo aceptar, rechazar o cambiar tu elección.',
  path: '/cookies',
});

const SECTIONS: LegalSectionDef[] = [
  { id: 'que-son', title: 'Qué son' },
  { id: 'cuales', title: 'Cuáles usamos' },
  { id: 'elegir', title: 'Cómo elegir' },
  { id: 'navegador', title: 'Desde tu navegador' },
];

export default function CookiesPage() {
  const analytics = analyticsId() !== undefined;
  return (
    <LegalPage
      title="Política de cookies"
      intro="Usamos lo mínimo para que el sitio funcione. La analítica, que solo existe si la activamos, nunca se enciende sin tu permiso."
      sections={SECTIONS}
    >
      <LegalSection id="que-son" title="Qué son">
        <p>
          Las cookies son pequeños archivos que el sitio guarda en tu navegador. Con ellas, y con el almacenamiento local del navegador, recordamos que iniciaste sesión o
          qué tema prefieres. Aquí las llamamos todas «cookies».
        </p>
      </LegalSection>

      <LegalSection id="cuales" title="Cuáles usamos">
        <h3>Necesarias (siempre activas)</h3>
        <p>Sin ellas el sitio no funciona o no es seguro, por eso no piden tu consentimiento.</p>
        <div className="legal-table-wrap">
          <table className="legal-table">
            <thead>
              <tr>
                <th scope="col">Nombre</th>
                <th scope="col">Para qué sirve</th>
                <th scope="col">Duración</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>session</code> (cookie)</td>
                <td>Mantiene tu sesión iniciada. Solo se envía a este sitio y el navegador no la deja leer a los scripts de la página.</td>
                <td>30 días, o hasta que cierres sesión</td>
              </tr>
              <tr>
                <td><code>rs-consent</code> (almacenamiento local)</td>
                <td>Recuerda tu elección sobre cookies.</td>
                <td>12 meses</td>
              </tr>
              <tr>
                <td><code>theme</code> (almacenamiento local)</td>
                <td>Recuerda si prefieres el tema claro, oscuro o el del sistema.</td>
                <td>Hasta que lo borres</td>
              </tr>
              <tr>
                <td><code>rs-static-…</code> (caché del navegador)</td>
                <td>Guarda los archivos del sitio y una página de aviso para cuando no hay conexión. No guarda datos personales.</td>
                <td>Hasta la siguiente versión del sitio</td>
              </tr>
              <tr>
                <td>Google reCAPTCHA y Firebase (terceros)</td>
                <td>En la página de ingreso, comprueban que quien pide el código es una persona y no un robot, y protegen el envío de mensajes de texto.</td>
                <td>Según Google; solo se cargan al ingresar</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h3>Analítica (solo con tu permiso)</h3>
        {analytics ? (
          <>
            <p>
              Usamos Google Analytics para saber cuántas personas visitan el sitio y qué páginas usan, sin publicidad ni perfiles. Se activa únicamente si aceptas
              y deja de funcionar, borrando sus cookies, si cambias de opinión.
            </p>
            <div className="legal-table-wrap">
              <table className="legal-table">
                <thead>
                  <tr>
                    <th scope="col">Nombre</th>
                    <th scope="col">Para qué sirve</th>
                    <th scope="col">Duración</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><code>_ga</code>, <code>_ga_*</code></td>
                    <td>Distinguen visitas y sesiones para contarlas.</td>
                    <td>Hasta 2 años</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p>Por ahora no usamos cookies de analítica ni de publicidad. Si algún día las activamos, te pediremos permiso antes de cargar nada y actualizaremos esta página.</p>
        )}
      </LegalSection>

      <LegalSection id="elegir" title="Cómo elegir">
        <p>
          Al entrar por primera vez ves un aviso con tus opciones. Puedes cambiar tu elección cuando quieras, aquí o desde «Preferencias de cookies» en el pie de
          página.
        </p>
        <div className="legal-actions">
          <CookiePreferencesButton className="btn">Abrir preferencias de cookies</CookiePreferencesButton>
        </div>
      </LegalSection>

      <LegalSection id="navegador" title="Desde tu navegador">
        <p>
          También puedes borrar o bloquear las cookies en la configuración de tu navegador. Si bloqueas las necesarias, no podrás iniciar sesión. El tratamiento de
          datos personales está explicado en la <a href="/privacidad">Política de privacidad</a>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
