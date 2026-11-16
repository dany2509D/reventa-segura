import { queuedPayouts } from '@/lib/admin/queries';
import { getDb } from '@/lib/db/client';
import { formatUsd } from '@/lib/format';
import { markPayoutPaidAction } from '../actions';
import { Flash, type FlashParams } from '../flash';

export default async function PayoutsPage({ searchParams }: { searchParams: Promise<FlashParams> }) {
  const rows = await queuedPayouts(getDb());
  return (
    <main>
      <h1>Pagos a vendedores</h1>
      <Flash params={await searchParams} />
      <p className="admin-muted">
        Transfiere desde la cuenta de la empresa y anota aquí la referencia del banco. Solo se pueden pagar las órdenes liberadas.
      </p>
      {rows.length === 0 ? <p>No hay pagos en cola.</p> : null}
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr><th>Evento</th><th>Vendedor</th><th>Monto</th><th>Estado de la orden</th><th>Registrar pago</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.payoutId}>
                <td>{r.eventName}</td>
                <td>{r.sellerPhone}</td>
                <td><strong>{formatUsd(r.amountCents)}</strong></td>
                <td>{r.orderState === 'liberada' ? 'Liberada' : `No pagable (${r.orderState})`}</td>
                <td>
                  {r.orderState === 'liberada' ? (
                    <form action={markPayoutPaidAction} className="admin-inline">
                      <input type="hidden" name="payoutId" value={r.payoutId} />
                      <input name="bankRef" placeholder="Referencia del banco" maxLength={100} required aria-label="Referencia del banco" />
                      <button type="submit">Marcar pagado</button>
                    </form>
                  ) : (
                    <span className="admin-muted">No se debe pagar</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
