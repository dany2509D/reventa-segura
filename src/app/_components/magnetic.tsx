'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { magneticOffset, pointerEffectsAllowed, shouldStepFrame, valueChanged } from '@/lib/ui/motion';

/**
 * Magnetic pull for ONE primary call to action per view: while a mouse hovers it, the control
 * leans a few pixels towards the pointer and eases back on leave. Reserved for a couple of
 * main CTAs on purpose; never applied to forms, navigation or lists.
 *
 * Off for touch and pen input, for coarse pointers and for reduced motion (the control is then a
 * perfectly ordinary link or button). Transform only, written at most once per frame.
 */
export default function Magnetic({ children, strength = 0.3, max = 7 }: { children: ReactNode; strength?: number; max?: number }) {
  const zone = useRef<HTMLSpanElement>(null);
  const body = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const area = zone.current;
    const el = body.current;
    if (!area || !el) return;
    let frame = 0;
    let x = 0;
    let y = 0;
    let lastX: number | null = null;
    let lastY: number | null = null;
    let lastPaint = -1;
    let cachedRect: DOMRect | null = null;

    const invalidateRect = () => {
      cachedRect = null;
    };
    const readRect = () => {
      cachedRect ??= area.getBoundingClientRect();
      return cachedRect;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const paint = (now: number) => {
      frame = 0;
      if (!shouldStepFrame(now, lastPaint)) {
        schedule();
        return;
      }
      if (valueChanged(x, lastX, 0.01) || valueChanged(y, lastY, 0.01)) {
        lastX = x;
        lastY = y;
        el.style.transform = x === 0 && y === 0 ? '' : `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
      }
      lastPaint = now;
    };
    const onEnter = () => {
      cachedRect = area.getBoundingClientRect();
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || !pointerEffectsAllowed(window)) return;
      // The zone itself never moves, so a cached box eliminates synchronous layout reads at 120 Hz.
      const o = magneticOffset(e.clientX, e.clientY, readRect(), strength, max);
      x = o.x;
      y = o.y;
      if (!el.hasAttribute('data-magnetic')) el.setAttribute('data-magnetic', 'active');
      schedule();
    };
    const onLeave = () => {
      x = 0;
      y = 0;
      el.removeAttribute('data-magnetic');
      schedule();
    };
    area.addEventListener('pointerenter', onEnter);
    area.addEventListener('pointermove', onMove);
    area.addEventListener('pointerleave', onLeave);
    area.addEventListener('pointercancel', onLeave);
    window.addEventListener('scroll', invalidateRect, { passive: true });
    window.addEventListener('resize', invalidateRect, { passive: true });
    return () => {
      area.removeEventListener('pointerenter', onEnter);
      area.removeEventListener('pointermove', onMove);
      area.removeEventListener('pointerleave', onLeave);
      area.removeEventListener('pointercancel', onLeave);
      window.removeEventListener('scroll', invalidateRect);
      window.removeEventListener('resize', invalidateRect);
      if (frame) cancelAnimationFrame(frame);
      el.style.transform = '';
    };
  }, [strength, max]);

  return (
    <span ref={zone} className="magnetic-zone">
      <span ref={body} className="magnetic">
        {children}
      </span>
    </span>
  );
}
