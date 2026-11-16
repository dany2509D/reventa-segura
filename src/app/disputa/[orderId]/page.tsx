import { notFound } from 'next/navigation';
import { buyerOrders } from '@/lib/account/queries';
import { getDb } from '@/lib/db/client';
import { formatPanamaDateTime } from '@/lib/format';
import BackLink from '../../_components/back-link';
import { requireUser } from '../../session';
import DisputeForm from './dispute-form';

export const metadata = { title: 'Reportar un problema' };
export const dynamic = 'force-dynamic';

const DISPUTABLE = ['transferencia_pendiente', 'entrada_recibida', 'ingreso_confirmado'];

export default async function DisputePage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const user = await requireUser(`/disputa/${orderId}`);
  const order = (await buyerOrders(getDb(), user.userId)).find((o) => o.orderId === orderId);
  if (!order) notFound();
  return (
    <main className="page">
      <BackLink href="/mis-ordenes">Mis órdenes</BackLink>
      <h1>Reportar un problema</h1>
      <p className="muted">{order.eventName} · {formatPanamaDateTime(order.startsAt)}</p>
      {DISPUTABLE.includes(order.state) ? (
        <>
          <p>
            Cuéntanos qué pasó (por ejemplo, que la entrada no funcionó en la puerta). Tu dinero queda retenido mientras lo revisamos
            y, si tienes razón, te lo devolvemos completo. Puedes reportar hasta 12 horas después del inicio del evento.
          </p>
          <DisputeForm orderId={orderId} />
        </>
      ) : (
        <p className="notice">Esta compra ya no admite reportes.</p>
      )}
    </main>
  );
}
