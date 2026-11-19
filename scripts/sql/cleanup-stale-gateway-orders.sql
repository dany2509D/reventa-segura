-- Limpieza de 2 órdenes de PRUEBA pagadas con el gateway falso (producción no tiene gateway, así que
-- el cron no puede reembolsarlas y falla en cada ejecución: maintenance_step_failed / expire_transfers).
-- Ejecutar en Supabase -> SQL Editor. Replica lo que hace refundPaidOrder() en src/lib/orders/settlement.ts:
--   orden -> 'reembolsada', asiento 'refund' negativo en ledger_entries y una fila en audit_log.
-- ledger_entries y audit_log son de solo añadir: aquí solo se INSERTA, nunca se actualiza ni borra.
--
-- ORDEN: 1) ejecuta PARTE 1 y revisa el resultado, 2) solo entonces ejecuta PARTE 2.

-- ============================== PARTE 1 · SOLO LECTURA ==============================

-- 1a) Qué órdenes son. Esperado: state = transferencia_pendiente y payment_method vacío (pasarela).
select o.id, o.state, o.payment_method, o.price_cents, o.fee_cents, o.provider_ref,
       o.transfer_deadline, e.name as evento, e.starts_at, u.phone as comprador
from orders o
join listings l on l.id = o.listing_id
join events e on e.id = l.event_id
join users u on u.id = o.buyer_id
where o.id in ('0fb86a78-b422-41b0-8b46-5d0c4aaaa310', '0e26f3f0-695e-4a27-b26c-a7b7df8cb572');

-- 1b) Su libro contable. Esperado: un 'charge' por orden y NINGÚN 'refund' todavía.
select order_id, kind, amount_cents, ref, created_at
from ledger_entries
where order_id in ('0fb86a78-b422-41b0-8b46-5d0c4aaaa310', '0e26f3f0-695e-4a27-b26c-a7b7df8cb572')
order by order_id, created_at;

-- ============================== PARTE 2 · CORRECCIÓN ================================
-- Solo toca esas 2 órdenes, y solo si siguen en 'transferencia_pendiente' y son de pasarela.
-- Es una sola sentencia (atómica): o se aplica todo o nada. Es seguro ejecutarla dos veces:
-- la segunda no encuentra órdenes en ese estado y devuelve 0 en todo.

with target as (
  select id, price_cents
  from orders
  where id in ('0fb86a78-b422-41b0-8b46-5d0c4aaaa310', '0e26f3f0-695e-4a27-b26c-a7b7df8cb572')
    and state = 'transferencia_pendiente'
    and payment_method is null
  for update
),
upd as (
  update orders o
  set state = 'reembolsada'
  from target t
  where o.id = t.id
  returning o.id, o.price_cents
),
led as (
  insert into ledger_entries (order_id, kind, amount_cents, ref)
  select u.id, 'refund', -u.price_cents, 'manual-cleanup-' || u.id::text
  from upd u
  where not exists (select 1 from ledger_entries le where le.order_id = u.id and le.kind = 'refund')
  returning order_id
),
aud as (
  insert into audit_log (actor_id, action, entity, entity_id, detail)
  select null, 'order.manual_cleanup', 'order', u.id::text,
         jsonb_build_object('reason', 'stale fake-gateway test order; no gateway in production',
                            'from', 'transferencia_pendiente', 'to', 'reembolsada')
  from upd u
  returning entity_id
)
select (select count(*) from upd) as ordenes_actualizadas,
       (select count(*) from led) as asientos_refund,
       (select count(*) from aud) as filas_auditoria;
-- Esperado: 2, 2, 2.

-- ============================== COMPROBACIÓN FINAL ==================================
-- Debe devolver 2 filas con state = 'reembolsada' y un 'refund' por orden.
select o.id, o.state, (select count(*) from ledger_entries le where le.order_id = o.id and le.kind = 'refund') as refunds
from orders o
where o.id in ('0fb86a78-b422-41b0-8b46-5d0c4aaaa310', '0e26f3f0-695e-4a27-b26c-a7b7df8cb572');
