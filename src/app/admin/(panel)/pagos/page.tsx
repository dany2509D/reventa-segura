import { manualPaymentQueue, queuedPayouts } from '@/lib/admin/queries';
import { getDb } from '@/lib/db/client';
import { requireAdminPage } from '../../session';
import { formatUsd } from '@/lib/format';
import { ConfirmActionButton } from '../../../_components/confirm-dialog';
import { approveManualPaymentAction, markPayoutPaidAction, rejectManualPaymentAction } from '../actions';
import { Flash, type FlashParams } from '../flash';

export default async function PayoutsPage({ searchParams }: { searchParams: Promise<FlashParams> }) {
  // Next can render a page without running its layout: the page gates itself.
  const actor = await requireAdminPage();
  const rows = await queuedPayouts(getDb(), actor);
  const manual = await manualPaymentQueue(getDb(), actor);
  return (
    <main>
      <h1>Pagos</h1>
      <Flash params={await searchParams} />
      <h2>Comprobantes por revisar (Yappy / ACH)</h2>
      <p className="admin-muted">
        Verifica en el banco que el dinero llegó con la referencia indicada antes de aprobar. Al aprobar, el comprador puede descargar su entrada.
      </p>
      {manual.length === 0 ? <p>No hay comprobantes pendientes.</p> : null}
      {manual.length > 0 ? (
        <div className="admin-table-wrap" role="region" aria-label="Comprobantes por revisar" tabIndex={0}>
          <table className="admin-table">
            <thead>
              <tr><th>Referencia</th><th>Evento</th><th>Método</th><th>Monto</th><th>Comprobante</th><th>Acciones</th></tr>
            </thead>
            <tbody>
              {manual.map((m) => (
                <tr key={m.orderId}>
                  <td>
                    <strong>{m.ref}</strong>
                    {m.buyerReference ? <div className="admin-muted">Ref. del comprador: {m.buyerReference}</div> : null}
                  </td>
                  <td>{m.eventName}</td>
                  <td>{m.method === 'yappy' ? 'Yappy' : 'ACH'}</td>
                  <td><strong>{formatUsd(m.priceCents)}</strong></td>
                  <td>
                    {m.proofKey ? (
                      <a href={`/api/admin/files?path=${encodeURIComponent(m.proofKey)}`} target="_blank" rel="noreferrer">Ver comprobante</a>
                    ) : (
                      <span className="admin-muted">Aún sin comprobante</span>
                    )}
                  </td>
                  <td>
                    {m.deliveryMode !== 'file' ? (
                      <span className="admin-muted">Solo se puede rechazar (entrega por transferencia)</span>
                    ) : (
                      <ConfirmActionButton
                        action={approveManualPaymentAction}
                        fields={{ orderId: m.orderId }}
                        triggerLabel="Aprobar pago"
                        triggerClassName="btn"
                        title={`¿Aprobar pago de ${formatUsd(m.priceCents)}?`}
                        description={`Confirma que ya verificaste la referencia ${m.ref} en el banco. Al aprobar, el comprador podrá descargar su entrada.`}
                        confirmLabel="Aprobar pago"
                      />
                    )}
                    <form action={rejectManualPaymentAction} className="admin-inline">
                      <input type="hidden" name="orderId" value={m.orderId} />
                      <input name="reason" placeholder="Motivo del rechazo" maxLength={500} required aria-label="Motivo del rechazo" />
                      <button className="btn" type="submit">Rechazar</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <h2>Pagos a vendedores</h2>
      <p className="admin-muted">
        Transfiere desde la cuenta de la empresa y anota aquí la referencia del banco. Solo se pueden pagar las órdenes liberadas.
      </p>
      {rows.length === 0 ? <p>No hay pagos en cola.</p> : null}
      <div className="admin-table-wrap" role="region" aria-label="Pagos a vendedores" tabIndex={0}>
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
                      <button className="btn" type="submit">Marcar pagado</button>
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
