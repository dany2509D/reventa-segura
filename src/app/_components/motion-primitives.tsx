'use client';

import { motion, useReducedMotion, type Variants } from 'motion/react';
import type { ReactNode } from 'react';

// Reusable motion building blocks. Every one respects the user's reduced-motion setting: with it
// on, nothing moves and nothing starts hidden. Server Components render these and pass them
// plain children, so the pages themselves stay on the server.

/** The easing used everywhere: a soft "expo out". */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE_OUT } },
};

type BaseProps = { children: ReactNode; className?: string };

/** Fades its children in while sliding them up 16 px, once, when they enter the viewport. */
export function FadeInUp({ children, className, delay = 0, as = 'div' }: BaseProps & { delay?: number; as?: 'div' | 'section' | 'p' | 'li' }) {
  const reduce = useReducedMotion();
  const Tag = motion[as];
  if (reduce) return <Tag className={className}>{children}</Tag>;
  return (
    <Tag
      className={className}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -8% 0px' }}
      transition={{ duration: 0.6, ease: EASE_OUT, delay }}
    >
      {children}
    </Tag>
  );
}

/** A container that reveals its `StaggerItem` children one after another. */
export function StaggerGrid({
  children,
  className,
  stagger = 0.08,
  as = 'div',
}: BaseProps & { stagger?: number; as?: 'div' | 'ol' | 'ul' }) {
  const reduce = useReducedMotion();
  const Tag = motion[as];
  if (reduce) return <Tag className={className}>{children}</Tag>;
  return (
    <Tag
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '0px 0px -8% 0px' }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: stagger } } }}
    >
      {children}
    </Tag>
  );
}

/** One child of a `StaggerGrid`: it takes its turn in the cascade. */
export function StaggerItem({ children, className, as = 'div' }: BaseProps & { as?: 'div' | 'li' }) {
  const reduce = useReducedMotion();
  const Tag = motion[as];
  if (reduce) return <Tag className={className}>{children}</Tag>;
  return (
    <Tag className={className} variants={itemVariants}>
      {children}
    </Tag>
  );
}

/** Lifts 4 px on hover/focus and lights its border (the glow itself lives in `.hover-card` CSS). */
export function HoverCard({ children, className = '' }: BaseProps) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={`hover-card ${className}`}>{children}</div>;
  return (
    <motion.div
      className={`hover-card ${className}`}
      whileHover={{ y: -4 }}
      whileFocus={{ y: -4 }}
      transition={{ type: 'spring', stiffness: 380, damping: 26 }}
    >
      {children}
    </motion.div>
  );
}
