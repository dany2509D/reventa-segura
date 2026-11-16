import { notFound } from 'next/navigation';
import { buyerOrders } from '@/lib/account/queries';
import { getDb } from '@/lib/db/client';
import { formatPanamaDateTime } from '@/lib/format';
import BackLink from '../../_components/back-link';
import { requireUser } from '../../session';
import EntryForm from './entry-form';

export const metadata = { title: 'Confirmar ingreso' };
export const dynamic = 'force-dynamic';

export default async function EntryPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const user = await requireUser(`/ingreso/${orderId}`);
  const order = (await buyerOrders(getDb(), user.userId)).find((o) => o.orderId === orderId);
  if (!order) notFound();
  return (
    <main className="page">
      <BackLink href="/mis-ordenes">Mis órdenes</BackLink>
      <h1>Confirmar mi ingreso</h1>
      <p className="muted">{order.eventName} · {formatPanamaDateTime(order.startsAt)}</p>
      {order.state === 'entrada_recibida' ? (
        <>
          <p>
            Ya estás en el evento. Toma una foto de tu entrada escaneada en la puerta (o de la pantalla del escáner) y confirma.
            Cuando confirmes, el pago se libera al vendedor al cerrar la ventana de disputas.
          </p>
          <EntryForm orderId={orderId} />
        </>
      ) : (
        <p className="notice">Esta compra no está esperando la confirmación de ingreso.</p>
      )}
    </main>
  );
}
