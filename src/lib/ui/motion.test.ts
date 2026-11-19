import { describe, expect, it } from 'vitest';
import {
  FINE_POINTER_QUERY,
  FRAME_PACE_MS,
  MIN_FRAME_INTERVAL_MS,
  REDUCED_MOTION_QUERY,
  TARGET_FPS_MAX,
  TARGET_FPS_MIN,
  clamp,
  magneticOffset,
  motionAllowed,
  pointerEffectsAllowed,
  shouldStepFrame,
  valueChanged,
  viewOffset,
  viewProgress,
} from './motion';

const win = (on: string[]) => ({ matchMedia: (q: string) => ({ matches: on.includes(q) }) });

describe('motion guards', () => {
  it('allows motion only when the visitor did not ask to reduce it', () => {
    expect(motionAllowed(win([]))).toBe(true);
    expect(motionAllowed(win([REDUCED_MOTION_QUERY]))).toBe(false);
  });

  it('is conservative when the preference cannot be read', () => {
    expect(motionAllowed(undefined)).toBe(false);
    expect(motionAllowed({})).toBe(false);
    expect(
      pointerEffectsAllowed({
        matchMedia: () => {
          throw new Error('unsupported');
        },
      }),
    ).toBe(false);
  });

  it('keeps pointer effects (magnetic, parallax) for fine pointers without reduced motion', () => {
    expect(pointerEffectsAllowed(win([FINE_POINTER_QUERY]))).toBe(true);
    expect(pointerEffectsAllowed(win([]))).toBe(false); // touch screen
    expect(pointerEffectsAllowed(win([FINE_POINTER_QUERY, REDUCED_MOTION_QUERY]))).toBe(false);
  });
});

describe('clamp', () => {
  it('keeps a value inside the range', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-5, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });
});

describe('magneticOffset', () => {
  const rect = { left: 100, top: 100, width: 200, height: 60 };
  it('is zero at the centre of the control', () => {
    expect(magneticOffset(200, 130, rect)).toEqual({ x: 0, y: 0 });
  });
  it('leans towards the pointer', () => {
    const o = magneticOffset(220, 120, rect, 0.25, 8);
    expect(o.x).toBeCloseTo(5);
    expect(o.y).toBeCloseTo(-2.5);
  });
  it('never exceeds the maximum pull', () => {
    expect(magneticOffset(900, -400, rect, 0.3, 8)).toEqual({ x: 8, y: -8 });
  });
});

describe('viewProgress', () => {
  const vh = 1000;
  it('is 0 before the element reaches the start line and 1 after it passes the end line', () => {
    expect(viewProgress(900, 400, vh)).toBe(0);
    expect(viewProgress(100, 400, vh)).toBe(1);
  });
  it('grows monotonically in between', () => {
    const a = viewProgress(700, 400, vh);
    const b = viewProgress(500, 400, vh);
    const c = viewProgress(300, 400, vh);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
    expect(c).toBeLessThanOrEqual(1);
  });
  it('is complete when the viewport height is unknown', () => {
    expect(viewProgress(500, 400, 0)).toBe(1);
  });
});

describe('viewOffset', () => {
  it('is 0 when the element is centred and stays within -1..1', () => {
    expect(viewOffset(400, 200, 1000)).toBe(0);
    expect(viewOffset(5000, 200, 1000)).toBe(-1);
    expect(viewOffset(-5000, 200, 1000)).toBe(1);
    expect(viewOffset(0, 100, 0)).toBe(0);
  });
});

describe('60-120 FPS frame pacing', () => {
  it('defines the [60, 120] FPS envelope and 120 Hz pacing threshold', () => {
    expect(TARGET_FPS_MIN).toBe(60);
    expect(TARGET_FPS_MAX).toBe(120);
    expect(MIN_FRAME_INTERVAL_MS).toBeCloseTo(1000 / 120);
    expect(FRAME_PACE_MS).toBeCloseTo(7.5);
  });

  it('allows initial frame, 60 Hz (~16.6 ms), and 120 Hz (~8.3 ms) while capping 240 Hz (~4.1 ms)', () => {
    expect(shouldStepFrame(100, -1)).toBe(true);
    expect(shouldStepFrame(104.1, 100)).toBe(false);
    expect(shouldStepFrame(108.3, 100)).toBe(true);
    expect(shouldStepFrame(116.7, 100)).toBe(true);
  });

  it('skips redundant DOM updates for negligible deltas', () => {
    expect(valueChanged(0, null)).toBe(true);
    expect(valueChanged(0.5002, 0.5)).toBe(false);
    expect(valueChanged(0.505, 0.5)).toBe(true);
  });
});
