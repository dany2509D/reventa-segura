'use client';

import { useEffect, useRef, useState } from 'react';
import { shouldPlay } from '@/lib/ui/video-state';

/**
 * Decorative background loop of the home poster. Starts paused on its poster frame and plays only
 * when motion is allowed and it is on screen; the button lets anyone stop it (WCAG 2.2.2).
 */
export default function HeroVideo({ src, poster }: { src: string; poster: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [reducedMotion, setReducedMotion] = useState(true);
  const [inView, setInView] = useState(true);
  const [userPaused, setUserPaused] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(mq.matches);
    update();
    mq.addEventListener('change', update);
    const el = ref.current;
    const io = el ? new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.1 }) : null;
    if (el && io) io.observe(el);
    return () => {
      mq.removeEventListener('change', update);
      io?.disconnect();
    };
  }, []);

  const playing = shouldPlay({ reducedMotion, inView, userPaused });

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (playing) v.play().catch(() => {});
    else v.pause();
  }, [playing]);

  return (
    <>
      <video ref={ref} className="hero-cartel-video" src={src} poster={poster} muted loop playsInline preload="metadata" aria-hidden="true" />
      {reducedMotion ? null : (
        <button type="button" className="hero-cartel-pause" aria-pressed={userPaused} onClick={() => setUserPaused((p) => !p)}>
          {userPaused ? 'Reproducir video' : 'Pausar video'}
        </button>
      )}
    </>
  );
}
