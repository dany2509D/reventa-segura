import type { Metadata } from 'next';
import { CONFIRMATION_WINDOW_MS } from '@/lib/entry/confirmation';
import { pageMetadata } from '@/lib/seo/metadata';
import { Fact, LegalPage, LegalSection, Todo, legalFacts, type LegalSectionDef } from '../_pages/legal';
import { TestModeNotice } from '../_components/test-mode';

export const metadata: Metadata = pageMetadata({
  title: 'Reembolsos y garantías',
  description:
    'Cómo funciona el pago protegido de Reventa Segura y cuándo te devolvemos el dinero: entrada que no llega, rechazo en la puerta o evento cancelado.',
  path: '/reembolsos',
});

const SECTIONS: LegalSectionDef[] = [
  { id: 'pago-protegido', title: 'Cómo te protege el pago' },
  { id: 'casos', title: 'Cuándo te devolvemos el dinero' },
  { id: 'abrir', title: 'Cómo abrir una disputa' },
  { id: 'resolucion', title: 'Cómo se resuelve' },
  { id: 'devolucion', title: 'Cómo y cuándo recibes el reembolso' },
  { id: 'no-cubre', title: 'Lo que no cubrimos' },
  { id: 'vendedores', title: 'Si eres vendedor' },
];

const WINDOW_HOURS = CONFIRMATION_WINDOW_MS / (60 * 60 * 1000);

export default function RefundsPage() {
  const f = legalFacts();
  const mail = f.email ? <a href={`mailto:${f.email}`}>{f.email}</a> : <Todo name="CORREO_DE_CONTACTO" />;
  return (
    <LegalPage
      title="Reembolsos y garantías"
      intro="Tu pago no llega al vendedor hasta que la compra termina bien. Aquí está lo que cubrimos, cómo reclamar y cómo se devuelve el dinero."
      sections={SECTIONS}
    >
      <TestModeNotice block />

      <LegalSection id="pago-protegido" title="Cómo te protege el pago">
        <p>
          Cuando compras, el dinero queda <strong>retenido</strong>. El vendedor lo cobra recién cuando cierra el plazo de reportes, {WINDOW_HOURS} horas después del
          inicio del evento. Mientras tanto puedes abrir una disputa si algo salió mal.
        </p>
      </LegalSection>

      <LegalSection id="casos" title="Cuándo te devolvemos el dinero">
        <p>Te devolvemos el dinero en estos casos (los tres primeros, cuando lo comprobamos al revisar tu disputa):</p>
        <ul>
          <li>La entrada <strong>no te llegó</strong> o el vendedor no la transfirió a tiempo.</li>
          <li>La entrada <strong>no es válida</strong>: es falsa, está duplicada o ya fue usada.</li>
          <li>Te <strong>rechazaron en la puerta</strong> por un problema de la entrada que compraste aquí.</li>
          <li>El <strong>evento se canceló</strong>: reembolsamos las órdenes de ese evento.</li>
          <li>Pagaste, pero la orden ya había expirado o se había cancelado: te devolvemos ese pago.</li>
        </ul>
      </LegalSection>

      <LegalSection id="abrir" title="Cómo abrir una disputa">
        <ol>
          <li>Entra a <a href="/mis-ordenes">Mis órdenes</a> y elige la orden.</li>
          <li>Toca <strong>Reportar un problema</strong>.</li>
          <li>Cuéntanos qué pasó y adjunta las fotos que ayuden (por ejemplo, el rechazo en la puerta).</li>
        </ol>
        <p>
          Puedes hacerlo hasta {WINDOW_HOURS} horas después del inicio del evento. Pasado ese plazo, el pago se libera al vendedor y ya no podemos retenerlo. Si
          necesitas ayuda, escríbenos a {mail}.
        </p>
      </LegalSection>

      <LegalSection id="resolucion" title="Cómo se resuelve">
        <p>
          Nuestro equipo revisa la disputa con la información de la orden, las fotos y lo que responda el vendedor. La decisión es una de dos: <strong>reembolso</strong>{' '}
          al comprador o <strong>liberación</strong> del pago al vendedor. El resultado aparece en tu orden.
        </p>
      </LegalSection>

      <LegalSection id="devolucion" title="Cómo y cuándo recibes el reembolso">
        <p>
          Devolvemos el importe que pagaste por la orden: la comisión de la plataforma se descuenta al vendedor, nunca a ti. El plazo depende de la pasarela y de
          tu banco: <Todo name="PLAZO_DE_REEMBOLSO" />. Si pagaste por Yappy o ACH, el reembolso se coordina de forma manual: <Todo name="PROCEDIMIENTO_DE_REEMBOLSO_MANUAL" />.
        </p>
      </LegalSection>

      <LegalSection id="no-cubre" title="Lo que no cubrimos">
        <ul>
          <li>Disputas abiertas después del plazo de reportes.</li>
          <li>Que ya no quieras asistir o hayas cambiado de opinión: <Todo name="POLITICA_DE_CAMBIO_DE_OPINION" />.</li>
          <li>Cambios de fecha, de horario o de recinto decididos por el organizador, salvo que el evento se cancele.</li>
          <li>Reclamos sin relación con la entrada comprada aquí.</li>
        </ul>
      </LegalSection>

      <LegalSection id="vendedores" title="Si eres vendedor">
        <p>
          Si una disputa se resuelve a favor del comprador, el pago de esa orden no se libera. Las disputas perdidas repetidas pueden llevar a limitar o bloquear tus ventas.
          Las reglas completas están en los <a href="/terminos">Términos y condiciones</a>.
        </p>
        <p>
          <Fact>{f.name}</Fact> · {mail}
        </p>
      </LegalSection>
    </LegalPage>
  );
}
