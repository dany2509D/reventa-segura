import { openDisputes } from '@/lib/admin/queries';
import { getDb } from '@/lib/db/client';
import { requireAdminPage } from '../../session';
import { formatPanamaDateTime, formatUsd } from '@/lib/format';
import { ConfirmActionButton } from '../../../_components/confirm-dialog';
import { resolveDisputeAction } from '../actions';
import { FileLink, Flash, type FlashParams } from '../flash';

export default async function DisputesPage({ searchParams }: { searchParams: Promise<FlashParams> }) {
  // Next can render a page without running its layout: the page gates itself.
  const actor = await requireAdminPage();
  const rows = await openDisputes(getDb(), actor);
  return (
    <main>
      <h1>Disputas abiertas</h1>
      <Flash params={await searchParams} />
      {rows.length === 0 ? <p>No hay disputas abiertas.</p> : null}
      <div className="admin-table-wrap" role="region" aria-label="Disputas abiertas" tabIndex={0}>
        <table className="admin-table">
          <thead>
            <tr><th>Evento</th><th>Comprador</th><th>Monto</th><th>Motivo</th><th>Evidencia</th><th>Abierta</th><th>Decisión</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.disputeId}>
                <td>{r.eventName}</td>
                <td>{r.buyerPhone}</td>
                <td>{formatUsd(r.priceCents)}</td>
                <td>{r.reason}</td>
                <td>
                  {r.evidencePaths.length === 0 ? <span className="admin-muted">—</span> : null}
                  {r.evidencePaths.map((p, i) => (
                    <div key={p}><FileLink path={p} label={`Archivo ${i + 1}`} /></div>
                  ))}
                </td>
                <td>{formatPanamaDateTime(r.openedAt)}</td>
                <td>
                  <div className="admin-inline">
                    <ConfirmActionButton
                      action={resolveDisputeAction}
                      fields={{ disputeId: r.disputeId, decision: 'refund' }}
                      triggerLabel="Reembolsar al comprador"
                      title="¿Reembolsar al comprador?"
                      description={`Se devolverán ${formatUsd(r.priceCents)} al comprador por ${r.eventName}. Esta decisión no se puede deshacer.`}
                      confirmLabel={`Reembolsar ${formatUsd(r.priceCents)}`}
                      tone="danger"
                    />
                    <ConfirmActionButton
                      action={resolveDisputeAction}
                      fields={{ disputeId: r.disputeId, decision: 'release' }}
                      triggerLabel="Liberar al vendedor"
                      title="¿Liberar el pago al vendedor?"
                      description={`Se pondrá en cola el pago al vendedor para ${r.eventName} (${formatUsd(r.priceCents)}). Esta decisión no se puede deshacer.`}
                      confirmLabel="Liberar al vendedor"
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
