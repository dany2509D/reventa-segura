import type { Metadata } from 'next';
import { CONFIRMATION_WINDOW_MS } from '@/lib/entry/confirmation';
import { DEFAULT_FEE_BPS, DEFAULT_PRICE_CAP_BPS } from '@/lib/pricing/pricing';
import { pageMetadata } from '@/lib/seo/metadata';
import { Fact, LegalPage, LegalSection, Todo, legalFacts, type LegalSectionDef } from '../_pages/legal';

export const metadata: Metadata = pageMetadata({
  title: 'Términos y condiciones y aviso legal',
  description:
    'Las reglas de Reventa Segura para compradores y vendedores de entradas en Panamá: pago retenido, comisión, disputas, responsabilidades y aviso legal.',
  path: '/terminos',
});

const SECTIONS: LegalSectionDef[] = [
  { id: 'aviso-legal', title: 'Aviso legal' },
  { id: 'servicio', title: 'Qué es Reventa Segura' },
  { id: 'cuenta', title: 'Tu cuenta' },
  { id: 'compradores', title: 'Si compras' },
  { id: 'vendedores', title: 'Si vendes' },
  { id: 'precios', title: 'Precios y comisión' },
  { id: 'reventa', title: 'Reventa, boleteras y recintos' },
  { id: 'disputas', title: 'Disputas y reembolsos' },
  { id: 'conducta', title: 'Conducta no permitida' },
  { id: 'responsabilidad', title: 'Responsabilidad' },
  { id: 'propiedad', title: 'Propiedad intelectual' },
  { id: 'ley', title: 'Ley aplicable' },
  { id: 'cambios', title: 'Cambios y contacto' },
];

const percent = (bps: number) => String(bps / 100).replace('.', ',');
const WINDOW_HOURS = CONFIRMATION_WINDOW_MS / (60 * 60 * 1000);

export default function TermsPage() {
  const f = legalFacts();
  const mail = f.email ? <a href={`mailto:${f.email}`}>{f.email}</a> : <Todo name="CORREO_DE_CONTACTO" />;
  return (
    <LegalPage
      title="Términos y condiciones y aviso legal"
      intro="Estas son las reglas para usar Reventa Segura, escritas para que las entiendas. Al crear una cuenta, comprar o vender aceptas estos términos y la Política de privacidad."
      sections={SECTIONS}
    >
      <LegalSection id="aviso-legal" title="Aviso legal">
        <p>
          Este sitio es operado por <strong><Fact>{f.name}</Fact></strong>, con RUC <Fact>{f.ruc}</Fact> y domicilio en <Fact>{f.address}</Fact>, República de
          Panamá. Contacto: {mail}.
        </p>
        <p>
          El sitio ofrece un espacio para que personas compren y vendan entradas de eventos entre sí, con pago protegido. Quien lo usa se obliga a
          hacerlo conforme a la ley, a estos términos y a la buena fe.
        </p>
      </LegalSection>

      <LegalSection id="servicio" title="Qué es Reventa Segura">
        <p>
          Reventa Segura es un <strong>mercado entre personas</strong>: las entradas las publican y las venden otros usuarios, no nosotros. No somos el
          organizador de los eventos ni la boletera, y no vendemos entradas propias.
        </p>
        <p>
          Lo que sí hacemos: verificar la identidad de quien vende, revisar cada publicación antes de mostrarla, cobrar el pago, retenerlo mientras se completa la
          entrega y liberarlo al vendedor cuando termina el plazo de reportes. Si hay un problema, revisamos la disputa y, si procede, devolvemos el dinero.
        </p>
      </LegalSection>

      <LegalSection id="cuenta" title="Tu cuenta">
        <ul>
          <li>Debes ser mayor de 18 años y tener un celular de Panamá, que verificamos con un código por mensaje de texto.</li>
          <li>Eres responsable de lo que se haga con tu cuenta. No compartas los códigos que recibes.</li>
          <li>Los datos que nos des deben ser verdaderos y estar actualizados.</li>
          <li>Podemos suspender o cerrar cuentas que incumplan estos términos o pongan en riesgo a otros usuarios.</li>
        </ul>
      </LegalSection>

      <LegalSection id="compradores" title="Si compras">
        <ul>
          <li>Pagas dentro de la plataforma (tarjeta, Yappy o ACH). El dinero no pasa al vendedor: queda retenido mientras se completa la entrega.</li>
          <li>Un pago pendiente que no se completa en el plazo indicado en la compra se cancela y la entrada vuelve a estar disponible.</li>
          <li>El vendedor te entrega la entrada por la boletera (Panatickets, Ticketplus u otra) o como imagen. Debes confirmar que la recibiste.</li>
          <li>El día del evento confirmas tu ingreso desde tu orden. Con esa confirmación y el cierre del plazo de reportes, el pago se libera al vendedor.</li>
          <li>
            Tienes hasta {WINDOW_HOURS} horas después del inicio del evento para abrir una disputa desde <strong>Mis órdenes</strong>. Pasado ese plazo, el pago
            se libera.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="vendedores" title="Si vendes">
        <ul>
          <li>Antes de publicar verificamos tu identidad con tu cédula o pasaporte y una selfie.</li>
          <li>Solo puedes vender entradas que sean tuyas, auténticas y que no hayas vendido ya por otro medio. Una misma entrada no puede publicarse dos veces.</li>
          <li>Revisamos cada publicación antes de mostrarla y podemos rechazarla o retirarla.</li>
          <li>Entregas la entrada al comprador por la boletera o como imagen, según lo que elijas al publicar.</li>
          <li>
            Cobras después del evento: el pago se libera cuando termina el plazo de reportes ({WINDOW_HOURS} horas después del inicio), siempre que no haya una
            disputa a favor del comprador.
          </li>
          <li>Podemos limitar cuántas publicaciones tienes activas y bloquear la venta a quien acumule disputas perdidas.</li>
        </ul>
      </LegalSection>

      <LegalSection id="precios" title="Precios y comisión">
        <ul>
          <li>El vendedor fija el precio de su entrada, hasta el {percent(DEFAULT_PRICE_CAP_BPS)} % de su valor original. Ese es el precio que paga el comprador.</li>
          <li>Cobramos una comisión del {percent(DEFAULT_FEE_BPS)} % por venta. Se descuenta del pago al vendedor: no se suma a lo que paga el comprador.</li>
          <li>Los precios están en dólares estadounidenses (USD). Los impuestos que correspondan se muestran en la compra: <Todo name="TRATAMIENTO_DE_ITBMS" />.</li>
        </ul>
      </LegalSection>

      <LegalSection id="reventa" title="Reventa, boleteras y recintos">
        <p>
          Algunos eventos prohíben la reventa o la transferencia de entradas. Los marcamos y no permitimos publicar entradas para ellos. Aun así, la boletera o el
          recinto decide quién entra y puede restringir o anular entradas revendidas: eso no depende de nosotros.
        </p>
        <p>Si te rechazan en la puerta por una entrada que compraste aquí, abre una disputa dentro del plazo y la revisaremos.</p>
      </LegalSection>

      <LegalSection id="disputas" title="Disputas y reembolsos">
        <p>
          Cómo abrir una disputa, qué casos cubrimos y cómo se devuelve el dinero está en la <a href="/reembolsos">Política de reembolsos y garantías</a>, que
          forma parte de estos términos.
        </p>
      </LegalSection>

      <LegalSection id="conducta" title="Conducta no permitida">
        <ul>
          <li>Publicar entradas falsas, duplicadas, alteradas o que no te pertenezcan.</li>
          <li>Suplantar a otra persona o usar documentos ajenos.</li>
          <li>Cobrar o pagar por fuera de la plataforma para evitar la retención del pago o la comisión.</li>
          <li>Abusar del servicio: robots, intentos de acceso no autorizado, abrir disputas falsas o repetidas sin fundamento.</li>
          <li>Usar el sitio para algo ilegal.</li>
        </ul>
        <p>Podemos retirar publicaciones, retener pagos bajo revisión, suspender cuentas y, si corresponde, informar a las autoridades.</p>
      </LegalSection>

      <LegalSection id="responsabilidad" title="Responsabilidad">
        <ul>
          <li>No organizamos los eventos: no respondemos por su cancelación, cambios de fecha o calidad. Si un evento se cancela, la orden se reembolsa según la política de reembolsos.</li>
          <li>No controlamos la decisión de la boletera o del recinto de admitir o no una entrada.</li>
          <li>El sitio puede tener interrupciones momentáneas por mantenimiento o causas ajenas a nosotros.</li>
          <li>
            En la medida que la ley lo permita, nuestra responsabilidad frente a ti por una operación se limita al monto que pagaste por ella. <Todo name="REVISION_LEGAL_DE_LA_LIMITACION_DE_RESPONSABILIDAD" />
          </li>
        </ul>
        <p>Nada de lo anterior limita los derechos que la ley te reconoce como consumidor.</p>
      </LegalSection>

      <LegalSection id="propiedad" title="Propiedad intelectual">
        <p>
          La marca, el diseño y el contenido del sitio son de <Fact>{f.name}</Fact>. Las ilustraciones de los eventos las genera la plataforma; los nombres de los
          eventos, artistas y recintos pertenecen a sus titulares y se usan solo para identificar el evento. Al subir una imagen (por ejemplo, tu entrada) nos
          autorizas a procesarla y mostrarla al comprador para completar la venta. Si crees que algún contenido vulnera tus derechos, escríbenos a {mail}.
        </p>
      </LegalSection>

      <LegalSection id="ley" title="Ley aplicable">
        <p>
          Estos términos se rigen por las leyes de la República de Panamá, incluidas las normas de protección al consumidor (Ley 45 de 2007) y de protección de
          datos personales (Ley 81 de 2019). Para resolver cualquier controversia son competentes los tribunales de Panamá, sin perjuicio de los derechos que la
          ley te dé como consumidor. <Todo name="NORMATIVA_ADICIONAL_Y_JURISDICCION" />
        </p>
      </LegalSection>

      <LegalSection id="cambios" title="Cambios y contacto">
        <p>
          Podemos actualizar estos términos. Si el cambio es importante lo avisaremos en el sitio antes de que aplique; seguir usando Reventa Segura después significa
          que lo aceptas. La fecha de arriba indica la versión vigente.
        </p>
        <p>
          <Fact>{f.name}</Fact> · <Fact>{f.address}</Fact> · {mail}
        </p>
      </LegalSection>
    </LegalPage>
  );
}
