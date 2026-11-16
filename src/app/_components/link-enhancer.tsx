'use client';

import { useEffect } from 'react';

const SHARED_NAME = 'poster-hero';
const MARK = 'data-shared-poster';

/**
 * Two small, document-wide enhancements for event cards (links marked `data-card`):
 *
 *  - Shared-element page transition. When a card is activated, its poster takes the
 *    view-transition-name of the event page's hero poster, so the browser morphs one into the
 *    other during the navigation. The name is given at click time (not in the markup) because an
 *    event can appear in several cards on a page and a transition name must be unique.
 *  - Space activates a focused card, as well as Enter.
 *
 * Nothing here cancels or delays a navigation: links stay plain links.
 */
export default function LinkEnhancer() {
  useEffect(() => {
    const clear = () =>
      document.querySelectorAll<HTMLElement>(`[${MARK}]`).forEach((el) => {
        el.style.removeProperty('view-transition-name');
        el.removeAttribute(MARK);
      });

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const card = e.target instanceof Element ? e.target.closest<HTMLAnchorElement>('a[data-card]') : null;
      if (!card) return;
      clear();
      const poster = card.querySelector<HTMLElement>('.poster');
      if (!poster) return;
      poster.style.setProperty('view-transition-name', SHARED_NAME);
      poster.setAttribute(MARK, '');
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== ' ' || e.defaultPrevented) return;
      const el = e.target;
      if (el instanceof HTMLAnchorElement && el.hasAttribute('data-card')) {
        e.preventDefault(); // do not scroll the page
        el.click();
      }
    };

    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKeyDown);
      clear();
    };
  }, []);
  return null;
}
