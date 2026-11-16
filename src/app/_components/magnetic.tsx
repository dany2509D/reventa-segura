'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { magneticOffset, pointerEffectsAllowed } from '@/lib/ui/motion';

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
    const paint = () => {
      frame = 0;
      el.style.transform = x === 0 && y === 0 ? '' : `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || !pointerEffectsAllowed(window)) return;
      // The zone itself never moves, so its box is a stable reference for the pull.
      const o = magneticOffset(e.clientX, e.clientY, area.getBoundingClientRect(), strength, max);
      x = o.x;
      y = o.y;
      el.setAttribute('data-magnetic', 'active');
      schedule();
    };
    const onLeave = () => {
      x = 0;
      y = 0;
      el.removeAttribute('data-magnetic');
      schedule();
    };
    area.addEventListener('pointermove', onMove);
    area.addEventListener('pointerleave', onLeave);
    area.addEventListener('pointercancel', onLeave);
    return () => {
      area.removeEventListener('pointermove', onMove);
      area.removeEventListener('pointerleave', onLeave);
      area.removeEventListener('pointercancel', onLeave);
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
