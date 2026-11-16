// Motion guards and the small pieces of maths behind the pointer and scroll effects.
// Pure functions (the window is passed in), so they are unit-tested without a browser.
// The motion language itself (durations, easings) lives in CSS: see the --dur-* / --ease-* tokens.

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
/** A mouse or trackpad: the only devices that get hover, magnetic and parallax effects. */
export const FINE_POINTER_QUERY = '(hover: hover) and (pointer: fine)';

type MediaWindow = { matchMedia?: (query: string) => { matches: boolean } };

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
