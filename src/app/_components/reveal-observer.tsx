'use client';

import { useEffect } from 'react';
import { motionAllowed } from '@/lib/ui/motion';

declare global {
  interface Window {
    /** Set when this observer has started: the bootstrap's 3 s failsafe then leaves the gate armed. */
    __rsReveal?: boolean;
  }
}

const DURATION_MS = 420;
const STAGGER_MS = 55;
const EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';

function readRevealIndex(el: Element): number {
  for (const cls of el.classList) {
    if (cls.startsWith('reveal-')) {
      const parsed = Number.parseInt(cls.slice(7), 10);
      if (!Number.isNaN(parsed)) return parsed;
    }
  }
  return 0;
}

/**
 * Scroll reveals for every `.reveal` element on the page (one observer for the whole document).
 *
 * Progressive enhancement: `.reveal` content is visible by default. It is held back only while
 * <html data-reveal="on">, which the inline bootstrap sets when JavaScript and
 * IntersectionObserver exist; if this component never mounts (a script failed to load), the
 * bootstrap withdraws the gate after 3 s. Reduced motion shows everything at once (CSS).
 *
 * An element is revealed with the Web Animations API (opacity + the `translate` property, held
 * by the animation's forwards fill) instead of by adding a class: the DOM's attributes are never
 * touched, so React's hydration has nothing to disagree with (Suspense boundaries hydrate late),
 * a client re-render cannot "un-reveal" anything, and `transform` stays free for hover states.
 * The stagger comes from the element's `--reveal-i` (classes .reveal-1 … .reveal-5).
 */
export default function RevealObserver() {
  useEffect(() => {
    window.__rsReveal = true;
    const root = document.documentElement;
    if (root.getAttribute('data-reveal') !== 'on') return;
    if (typeof IntersectionObserver === 'undefined' || typeof Element.prototype.animate !== 'function' || !motionAllowed(window)) {
      root.removeAttribute('data-reveal');
      return;
    }

    const done = new WeakSet<Element>();
    const reveal = (el: Element, instant: boolean) => {
      if (done.has(el)) return;
      done.add(el);
      const index = readRevealIndex(el);
      el.animate(
        [
          { opacity: 0, translate: '0 16px' },
          { opacity: 1, translate: '0 0' },
        ],
        { duration: instant ? 0 : DURATION_MS, delay: instant ? 0 : index * STAGGER_MS, easing: EASING, fill: 'both' },
      );
    };

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const passed = entry.boundingClientRect.top < 0; // a reload restored the scroll position
          if (entry.isIntersecting || passed) {
            reveal(entry.target, passed && !entry.isIntersecting);
            io.unobserve(entry.target);
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.06 },
    );
    const watch = (scope: ParentNode) => scope.querySelectorAll('.reveal').forEach((el) => !done.has(el) && io.observe(el));
    watch(document);

    // Content streamed in after this effect ran (Suspense boundaries) must be observed too, or it
    // would stay held back.
    const mo = new MutationObserver((records) => {
      for (const record of records) {
        record.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;
          if (node.matches('.reveal') && !done.has(node)) io.observe(node);
          watch(node);
        });
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, []);
  return null;
}
