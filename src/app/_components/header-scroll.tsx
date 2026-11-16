'use client';

import { useEffect, useRef } from 'react';

/**
 * Tells the header whether the page has scrolled, without a scroll handler: an
 * IntersectionObserver watches a 24 px sentinel at the top of the document and toggles
 * `data-scrolled` on the header (the CSS does the rest, with transforms and opacity only).
 */
export default function HeaderScroll() {
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const mark = sentinel.current;
    const header = document.getElementById('site-header');
    if (!mark || !header) return;
    if (typeof IntersectionObserver === 'undefined') {
      const onScroll = () => header.toggleAttribute('data-scrolled', window.scrollY > 24);
      onScroll();
      window.addEventListener('scroll', onScroll, { passive: true });
      return () => window.removeEventListener('scroll', onScroll);
    }
    const io = new IntersectionObserver(([entry]) => header.toggleAttribute('data-scrolled', !entry.isIntersecting));
    io.observe(mark);
    return () => io.disconnect();
  }, []);
  return <div ref={sentinel} className="scroll-sentinel" aria-hidden="true" />;
}
