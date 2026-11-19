'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { motionAllowed, pointerEffectsAllowed, shouldStepFrame, valueChanged, viewOffset, viewProgress } from '@/lib/ui/motion';

type Props = {
  /**
   * 'progress': 0 → 1 as the element crosses the viewport (draws the connected steps).
   * 'offset':  −1 … 1 around the viewport centre (the light parallax of the hero artwork).
   */
  mode: 'progress' | 'offset';
  className?: string;
  children: ReactNode;
};

/**
 * Scroll-linked scene: exposes one number as the CSS custom property `--scene` on its wrapper;
 * the stylesheet turns it into transforms. Without JavaScript, with reduced motion, and (for the
 * parallax) on touch devices, the property is never written and the CSS default applies: the
 * finished state, with no movement.
 *
 * Cost: one passive scroll listener that only works while the scene is near the viewport, one
 * layout read and one style write per animation frame.
 */
export default function ScrollScene({ mode, className, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window)) return;
    if (!motionAllowed(window)) return;
    if (mode === 'offset' && !pointerEffectsAllowed(window)) return;

    let frame = 0;
    let near = false;
    let lastPaint = -1;
    let lastValue: number | null = null;
    const schedule = () => {
      if (near && !frame) frame = requestAnimationFrame(update);
    };
    const update = (now: number) => {
      frame = 0;
      if (!shouldStepFrame(now, lastPaint)) {
        schedule();
        return;
      }
      const rect = el.getBoundingClientRect();
      const value = mode === 'progress' ? viewProgress(rect.top, rect.height, window.innerHeight) : viewOffset(rect.top, rect.height, window.innerHeight);
      if (valueChanged(value, lastValue)) {
        lastValue = value;
        el.style.setProperty('--scene', value.toFixed(4));
      }
      lastPaint = now;
    };
    const io = new IntersectionObserver(
      ([entry]) => {
        near = entry.isIntersecting;
        schedule();
      },
      { rootMargin: '25% 0px' },
    );
    io.observe(el);
    el.setAttribute('data-scene', mode);
    update(performance.now());
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    return () => {
      io.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (frame) cancelAnimationFrame(frame);
      el.removeAttribute('data-scene');
      el.style.removeProperty('--scene');
    };
  }, [mode]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
