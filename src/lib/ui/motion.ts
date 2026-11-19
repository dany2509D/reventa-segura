// Motion guards and the small pieces of maths behind the pointer and scroll effects.
// Pure functions (the window is passed in), so they are unit-tested without a browser.
// The motion language itself (durations, easings) lives in CSS: see the --dur-* / --ease-* tokens.

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
/** A mouse or trackpad: the only devices that get hover, magnetic and parallax effects. */
export const FINE_POINTER_QUERY = '(hover: hover) and (pointer: fine)';

/** Frame-rate envelope enforced for JS-driven motion (scroll scenes, pointer pull). */
export const TARGET_FPS_MIN = 60;
export const TARGET_FPS_MAX = 120;
export const MIN_FRAME_INTERVAL_MS = 1000 / TARGET_FPS_MAX;
/** Slight jitter tolerance (~90% of 8.33 ms) so native 120 Hz ProMotion rAF never skips alternate frames while >120 Hz panels cap at <=120 FPS. */
export const FRAME_PACE_MS = MIN_FRAME_INTERVAL_MS * 0.9;

type MediaWindow = { matchMedia?: (query: string) => { matches: boolean } };

/** Gates rAF ticks so interactive effects stay smooth up to 120 FPS max without overspinning 144/240 Hz displays. */
export function shouldStepFrame(nowMs: number, lastStepMs: number): boolean {
  if (lastStepMs < 0) return true;
  return nowMs - lastStepMs >= FRAME_PACE_MS;
}

/** Avoids redundant DOM writes when the rounded property would not visibly move. */
export function valueChanged(next: number, prev: number | null, epsilon = 0.0008): boolean {
  return prev === null || Math.abs(next - prev) >= epsilon;
}

function matches(win: MediaWindow | undefined, query: string): boolean {
  try {
    return win?.matchMedia?.(query).matches === true;
  } catch {
    return false;
  }
}

/** False when the visitor asked for reduced motion (or when it cannot be known: be conservative). */
export function motionAllowed(win: MediaWindow | undefined): boolean {
  if (!win?.matchMedia) return false;
  return !matches(win, REDUCED_MOTION_QUERY);
}

/** Pointer-driven effects (magnetic buttons, parallax): fine pointer and motion allowed. */
export function pointerEffectsAllowed(win: MediaWindow | undefined): boolean {
  return motionAllowed(win) && matches(win, FINE_POINTER_QUERY);
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

type Rect = { left: number; top: number; width: number; height: number };

/**
 * Magnetic pull: how far (px) a control leans towards the pointer. Proportional to the distance
 * from the control's centre, never more than `max` on either axis.
 */
export function magneticOffset(pointerX: number, pointerY: number, rect: Rect, strength = 0.28, max = 8): { x: number; y: number } {
  const dx = pointerX - (rect.left + rect.width / 2);
  const dy = pointerY - (rect.top + rect.height / 2);
  return { x: clamp(dx * strength, -max, max), y: clamp(dy * strength, -max, max) };
}

/**
 * Progress (0 → 1) of an element through the viewport, for scroll-linked drawing: 0 while its top
 * is still below `startAt` of the viewport height, 1 once its bottom has risen above `endAt`.
 */
export function viewProgress(rectTop: number, rectHeight: number, viewportHeight: number, startAt = 0.85, endAt = 0.55): number {
  if (viewportHeight <= 0) return 1;
  const start = viewportHeight * startAt;
  const end = viewportHeight * endAt - rectHeight;
  if (start === end) return rectTop <= start ? 1 : 0;
  return clamp((start - rectTop) / (start - end), 0, 1);
}

/**
 * Position (−1 … 1) of an element's centre relative to the viewport's centre: −1 when it sits one
 * viewport below, 0 when centred, 1 when one viewport above. Drives the light parallax.
 */
export function viewOffset(rectTop: number, rectHeight: number, viewportHeight: number): number {
  if (viewportHeight <= 0) return 0;
  const centre = rectTop + rectHeight / 2;
  return clamp((viewportHeight / 2 - centre) / viewportHeight, -1, 1);
}
