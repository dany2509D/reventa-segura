// Single-line ink illustration in the style of the reference kit: a smiling ticket with a curl,
// on a big pastel circle. Paths only, stroke-only ink, no fonts; colours come from CSS tokens
// through the tone class of the container (tone-sky / tone-mint / tone-pink).

export type Tone = 'sky' | 'mint' | 'pink';
const TONES: Tone[] = ['sky', 'mint', 'pink'];

/** Deterministic pastel tone for an id (same event, same colour on every page). */
export function toneFor(id: string): Tone {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return TONES[h % TONES.length];
}

export function TicketDoodle() {
  return (
    <svg className="doodle" viewBox="0 0 240 200" aria-hidden="true" focusable="false">
      <path className="doodle-circle" d="M120 26A84 84 0 1 1 119.99 26Z" />
      <g className="doodle-ink" transform="rotate(-9 120 112)">
        <path d="M66 76H174A10 10 0 0 1 184 86V101A11 11 0 0 0 184 123V138A10 10 0 0 1 174 148H66A10 10 0 0 1 56 138V123A11 11 0 0 0 56 101V86A10 10 0 0 1 66 76Z" />
        <path className="doodle-perf" d="M150 86V138" />
        <path className="doodle-dots" d="M86 104h.01M116 104h.01" />
        <path d="M84 120C93 132 109 132 118 120" />
        <path d="M98 76C96 58 84 50 90 38C96 26 116 30 112 44C108 56 126 62 150 46" />
      </g>
    </svg>
  );
}

/** Big rounded pastel panel holding the illustration (hero of inner pages). */
export function DoodlePanel({ tone, compact = false }: { tone: Tone; compact?: boolean }) {
  return (
    <div className={`doodle-panel tone-${tone}${compact ? ' compact' : ''}`}>
      <TicketDoodle />
    </div>
  );
}
