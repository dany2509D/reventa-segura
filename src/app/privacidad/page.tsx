import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo/metadata';
import { Fact, LegalPage, LegalSection, Todo, legalFacts, type LegalSectionDef } from '../_pages/legal';

export const metadata: Metadata = pageMetadata({
  title: 'Política de privacidad',
  description:
    'Qué datos personales tratamos en Reventa Segura, para qué, con quién los compartimos, cuánto tiempo los guardamos y cómo ejercer tus derechos.',
  path: '/privacidad',
});

const SECTIONS: LegalSectionDef[] = [
  { id: 'responsable', title: 'Quién es el responsable' },
  { id: 'datos', title: 'Qué datos tratamos' },
  { id: 'finalidades', title: 'Para qué los usamos' },
  { id: 'terceros', title: 'Con quién los compartimos' },
  { id: 'conservacion', title: 'Cuánto tiempo los guardamos' },
  { id: 'seguridad', title: 'Cómo los protegemos' },
  { id: 'derechos', title: 'Tus derechos' },
  { id: 'cookies', title: 'Cookies' },
  { id: 'menores', title: 'Menores de edad' },
  { id: 'cambios', title: 'Cambios a esta política' },
  { id: 'contacto', title: 'Contacto' },
];

export default function PrivacyPage() {
  const f = legalFacts();
  return (
    <LegalPage
      title="Política de privacidad"
      intro="Aquí te explicamos qué datos personales tratamos cuando usas Reventa Segura, para qué, con quién los compartimos y qué puedes hacer con ellos. Aplicamos la Ley 81 de 2019 sobre protección de datos personales de la República de Panamá y su reglamentación."
      sections={SECTIONS}
    >
      <LegalSection id="responsable" title="Quién es el responsable">
        <p>
          El responsable del tratamiento de tus datos es <strong><Fact>{f.name}</Fact></strong> (RUC <Fact>{f.ruc}</Fact>), con domicilio en{' '}
          <Fact>{f.address}</Fact>. Para cualquier tema de privacidad escríbenos a{' '}
          {f.email ? <a href={`mailto:${f.email}`}>{f.email}</a> : <Todo name="CORREO_DE_CONTACTO" />}.
        </p>
      </LegalSection>

      <LegalSection id="datos" title="Qué datos tratamos">
        <p>Solo pedimos lo necesario para que una compra o una venta salgan bien. Según lo que hagas, tratamos:</p>
        <ul>
          <li>
            <strong>Tu cuenta.</strong> Tu número de celular, que verificamos con un código por mensaje de texto. No usamos contraseña.
          </li>
          <li>
            <strong>Verificación de identidad (solo si vendes).</strong> Una foto de tu cédula o pasaporte y una selfie, para confirmar que eres tú. Se
            guardan en un almacenamiento privado: solo las ve el equipo de verificación.
          </li>
          <li>
            <strong>Tus publicaciones.</strong> La entrada que publicas (imagen o comprobante, con su código QR), el evento y el precio.
          </li>
          <li>
            <strong>Tus compras y pagos.</strong> Tus órdenes, importes, el método de pago (tarjeta, Yappy o ACH), la referencia y, si pagas por transferencia,
            el comprobante que subes. No recibimos ni guardamos el número de tu tarjeta: lo procesa la pasarela de pago.
          </li>
          <li>
            <strong>Datos de cobro (vendedores).</strong> Los que nos indiques para transferirte el pago.
          </li>
          <li>
            <strong>Ingreso al evento.</strong> La foto que subes al confirmar tu ingreso y, si lo autorizas en tu navegador, tu ubicación en ese momento. La
            ubicación solo sirve para comprobar si estás cerca del recinto: guardamos el resultado (dentro o fuera), no las coordenadas.
          </li>
          <li>
            <strong>Disputas.</strong> El motivo que escribas y las fotos que adjuntes.
          </li>
          <li>
            <strong>Datos técnicos y de seguridad.</strong> Tu dirección IP, que usamos para limitar intentos abusivos, y un historial de auditoría de cada
            operación. También la cookie de sesión (ver <a href="/cookies">Cookies</a>).
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="finalidades" title="Para qué los usamos">
        <div className="legal-table-wrap">
          <table className="legal-table">
            <thead>
              <tr>
                <th scope="col">Finalidad</th>
                <th scope="col">Datos</th>
                <th scope="col">Base legal</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Crear tu cuenta y verificar tu celular</td>
                <td>Celular</td>
                <td>Prestarte el servicio que pides</td>
              </tr>
              <tr>
                <td>Verificar vendedores y revisar publicaciones</td>
                <td>Documento, selfie, entrada</td>
                <td>Tu consentimiento al enviarlos y la protección de los compradores frente al fraude</td>
              </tr>
              <tr>
                <td>Cobrar, retener y liberar pagos; reembolsar</td>
                <td>Órdenes, pagos, datos de cobro</td>
                <td>Ejecución del contrato de compraventa</td>
              </tr>
              <tr>
                <td>Resolver disputas</td>
                <td>Motivo, fotos, historial de la orden</td>
                <td>Ejecución del contrato e interés legítimo</td>
              </tr>
              <tr>
                <td>Confirmar tu ingreso al evento</td>
                <td>Foto, ubicación</td>
                <td>Tu consentimiento (tu navegador te pide permiso)</td>
              </tr>
              <tr>
                <td>Seguridad, prevención de fraude y auditoría</td>
                <td>IP, registros de actividad</td>
                <td>Interés legítimo y obligaciones legales</td>
              </tr>
              <tr>
                <td>Obligaciones contables y tributarias</td>
                <td>Órdenes y registros de pagos</td>
                <td>Obligación legal</td>
              </tr>
              <tr>
                <td>Medir las visitas al sitio</td>
                <td>Datos de navegación</td>
                <td>Solo con tu consentimiento (cookies de analítica)</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>Cuando la base es tu consentimiento, puedes retirarlo cuando quieras; no afecta a lo que ya se trató antes.</p>
      </LegalSection>

      <LegalSection id="terceros" title="Con quién los compartimos">
        <p>Usamos proveedores que tratan datos por nuestra cuenta, solo para prestar el servicio:</p>
        <ul>
          <li>
            <strong>Vercel</strong>: alojamiento de la aplicación y almacenamiento de los archivos privados.
          </li>
          <li>
            <strong>Supabase</strong>: base de datos.
          </li>
          <li>
            <strong>Google (Firebase Authentication y reCAPTCHA)</strong>: verificación del celular y protección contra robots en la página de ingreso.
          </li>
          <li>
            <strong>Pasarela de pago</strong>: <Todo name="PASARELA_DE_PAGO" />.
          </li>
          <li>
            <strong>Mensajes de texto</strong>: <Todo name="PROVEEDOR_DE_SMS" />.
          </li>
          <li>
            <strong>Google Analytics</strong>: solo si aceptas las cookies de analítica y únicamente cuando esa herramienta esté activada.
          </li>
        </ul>
        <p>
          No vendemos tus datos personales ni los usamos para publicidad de terceros. Podemos comunicarlos a una autoridad cuando una ley o una orden
          competente lo exija.
        </p>
        <p>
          Algunos proveedores tienen sus servidores fuera de Panamá (por ejemplo, en Estados Unidos). Los elegimos por sus medidas de seguridad y sus
          compromisos de protección de datos; <Todo name="BASE_DE_TRANSFERENCIA_INTERNACIONAL" />.
        </p>
      </LegalSection>

      <LegalSection id="conservacion" title="Cuánto tiempo los guardamos">
        <ul>
          <li>
            <strong>Documento de identidad y selfie:</strong> <Todo name="PLAZO_RETENCION_IDENTIDAD" />. Al vencer ese plazo se borran de forma automática.
          </li>
          <li>
            <strong>Registros contables y de auditoría de las operaciones:</strong> <Todo name="PLAZO_RETENCION_REGISTROS" />. Se guardan sin posibilidad de
            modificarlos, por eso no pueden borrarse antes.
          </li>
          <li>
            <strong>Tu sesión:</strong> dura 30 días y se cierra antes si sales de tu cuenta.
          </li>
          <li>
            <strong>El resto de tus datos:</strong> mientras tu cuenta exista y mientras la ley nos obligue a conservarlos.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="seguridad" title="Cómo los protegemos">
        <ul>
          <li>Todo el sitio se sirve por HTTPS.</li>
          <li>Los documentos y fotos se guardan en almacenamiento privado y se abren con enlaces firmados que duran un minuto.</li>
          <li>Solo el equipo autorizado accede al panel de administración, con verificación en dos pasos.</li>
          <li>Limitamos los intentos de ingreso y de envío de códigos para frenar abusos y robots.</li>
          <li>Ninguna medida es infalible. Si detectamos una brecha que te afecte, te lo diremos y te explicaremos qué hacer.</li>
        </ul>
      </LegalSection>

      <LegalSection id="derechos" title="Tus derechos">
        <p>
          Tienes derecho a <strong>acceder</strong> a tus datos, <strong>rectificarlos</strong>, <strong>cancelarlos</strong>, <strong>oponerte</strong> a su
          tratamiento y pedir su <strong>portabilidad</strong>, en los términos de la Ley 81 de 2019.
        </p>
        <p>
          Para ejercerlos escríbenos a {f.email ? <a href={`mailto:${f.email}`}>{f.email}</a> : <Todo name="CORREO_DE_CONTACTO" />} desde el celular de tu
          cuenta o indicándolo en el mensaje, para comprobar que eres tú. Te respondemos en <Todo name="PLAZO_RESPUESTA_DERECHOS" />.
        </p>
        <p>
          Algunos datos no podemos borrarlos de inmediato porque la ley o la seguridad de las operaciones exigen conservarlos (por ejemplo, los registros
          contables). Si crees que no atendimos bien tu solicitud, puedes acudir a la autoridad de protección de datos personales de Panamá (
          <Todo name="AUTORIDAD_DE_PROTECCION_DE_DATOS" />).
        </p>
      </LegalSection>

      <LegalSection id="cookies" title="Cookies">
        <p>
          Usamos almacenamiento necesario para que el sitio funcione (tu sesión y el tema) y, solo con tu permiso, analítica. Lo detallamos en la{' '}
          <a href="/cookies">Política de cookies</a>.
        </p>
      </LegalSection>

      <LegalSection id="menores" title="Menores de edad">
        <p>
          Reventa Segura es solo para personas mayores de 18 años. No recopilamos a sabiendas datos de menores. Si crees que un menor creó una cuenta,
          escríbenos y la eliminaremos.
        </p>
      </LegalSection>

      <LegalSection id="cambios" title="Cambios a esta política">
        <p>
          Si cambiamos esta política por algo importante (un nuevo uso de tus datos, un nuevo proveedor), lo avisaremos en el sitio antes de que aplique. La
          fecha de arriba indica la versión vigente.
        </p>
      </LegalSection>

      <LegalSection id="contacto" title="Contacto">
        <p>
          <Fact>{f.name}</Fact> · <Fact>{f.address}</Fact> · {f.email ? <a href={`mailto:${f.email}`}>{f.email}</a> : <Todo name="CORREO_DE_CONTACTO" />}
        </p>
      </LegalSection>
    </LegalPage>
  );
}
