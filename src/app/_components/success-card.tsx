'use client';

import { useEffect, useRef, type ReactNode } from 'react';

// Result panel that replaces a form after a successful submit. The form (and the button that was
// focused) disappears, so focus would fall back to <body>; this moves it to the panel and
// announces it, so keyboard and screen-reader users know the action went through.
export default function SuccessCard({ tone, children }: { tone: 'mint' | 'sky'; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <div ref={ref} className={`card pastel tone-${tone} success-card`} role="status" tabIndex={-1}>
      {children}
    </div>
  );
}
