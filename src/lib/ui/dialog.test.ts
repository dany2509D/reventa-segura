import { describe, expect, it } from 'vitest';
import { isOutsideDialogRect } from './dialog';

describe('isOutsideDialogRect', () => {
  const box = { left: 100, right: 500, top: 200, bottom: 400 };

  it('returns false when pointer is inside or on the border of the dialog box', () => {
    expect(isOutsideDialogRect(box, 300, 300)).toBe(false);
    expect(isOutsideDialogRect(box, 100, 200)).toBe(false);
    expect(isOutsideDialogRect(box, 500, 400)).toBe(false);
  });

  it('returns true when pointer is outside on any side', () => {
    expect(isOutsideDialogRect(box, 99, 300)).toBe(true);
    expect(isOutsideDialogRect(box, 501, 300)).toBe(true);
    expect(isOutsideDialogRect(box, 300, 199)).toBe(true);
    expect(isOutsideDialogRect(box, 300, 401)).toBe(true);
  });
});
