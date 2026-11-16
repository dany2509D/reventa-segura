import { openDisputes } from '@/lib/admin/queries';
import { getDb } from '@/lib/db/client';
import { formatPanamaDateTime, formatUsd } from '@/lib/format';
import { resolveDisputeAction } from '../actions';
import { FileLink, Flash, type FlashParams } from '../flash';

export default async function DisputesPage({ searchParams }: { searchParams: Promise<FlashParams> }) {
  const rows = await openDisputes(getDb());
  return (
    <main>
      <h1>Disputas abiertas</h1>
      <Flash params={await searchParams} />
      {rows.length === 0 ? <p>No hay disputas abiertas.</p> : null}
      <div className="admin-table-wrap">
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
                  <form action={resolveDisputeAction} className="admin-inline">
                    <input type="hidden" name="disputeId" value={r.disputeId} />
                    <button name="decision" value="refund" type="submit">Reembolsar al comprador</button>
                    <button name="decision" value="release" type="submit">Liberar al vendedor</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
