import { manualReviewOrders } from '@/lib/admin/queries';
import { getDb } from '@/lib/db/client';
import { requireAdminPage } from '../../session';
import { formatPanamaDateTime, formatUsd } from '@/lib/format';

export default async function ManualReviewPage() {
  // Next can render a page without running its layout: the page gates itself.
  const actor = await requireAdminPage();
  const rows = await manualReviewOrders(getDb(), actor);
  return (
    <main>
      <h1>Órdenes a revisar a mano</h1>
      <p className="admin-muted">
        Casos que el sistema no puede cerrar solo (por ejemplo, evento cancelado después de pagar al vendedor).
        Resuélvelos con el comprador y el vendedor y deja constancia fuera del sistema.
      </p>
      {rows.length === 0 ? <p>No hay órdenes pendientes de revisión.</p> : null}
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr><th>Orden</th><th>Evento</th><th>Comprador</th><th>Vendedor</th><th>Monto</th><th>Estado</th><th>Creada</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.orderId}>
                <td><code>{r.orderId}</code></td>
                <td>{r.eventName}</td>
                <td>{r.buyerPhone}</td>
                <td>{r.sellerPhone}</td>
                <td>{formatUsd(r.priceCents)}</td>
                <td>{r.orderState}</td>
                <td>{formatPanamaDateTime(r.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
