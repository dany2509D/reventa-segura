import { describe, expect, it } from 'vitest';
import { escrowStages } from './escrow';

describe('escrowStages', () => {
  it('walks held → delivered → closed', () => {
    expect(escrowStages('creada')).toEqual(['', '', '']);
    expect(escrowStages('transferencia_pendiente')).toEqual(['is-done', '', '']);
    expect(escrowStages('comprobante_en_revision')).toEqual(['is-done', '', '']);
    expect(escrowStages('entrada_recibida')).toEqual(['is-done', 'is-done', '']);
    expect(escrowStages('ingreso_confirmado')).toEqual(['is-done', 'is-done', '']);
    expect(escrowStages('liberada')).toEqual(['is-done', 'is-done', 'is-done']);
    expect(escrowStages('liquidada')).toEqual(['is-done', 'is-done', 'is-done']);
  });

  it('flags a dispute on the delivery stage and hides the track for dead orders', () => {
    expect(escrowStages('disputada')).toEqual(['is-done', 'is-alert', '']);
    expect(escrowStages('reembolsada')).toBeNull();
    expect(escrowStages('cancelada')).toBeNull();
  });
});
