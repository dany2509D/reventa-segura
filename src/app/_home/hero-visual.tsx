import type { ReactNode } from 'react';
import ScrollScene from '../_components/scroll-scene';

// Front row of the crowd: [x of the head, y of the head, raised arm: -1 left, 1 right, 0 none]
const FRONT: [number, number, -1 | 0 | 1][] = [
  [34, 654, 0], [132, 640, 1], [236, 660, -1], [338, 644, 0], [438, 658, 1], [540, 642, -1], [628, 662, 0],
];
// Back row: smaller and lighter, between the heads of the front row
const BACK: [number, number][] = [[84, 596], [186, 586], [288, 600], [392, 588], [490, 598], [590, 584]];

/**
 * The hero's protagonist visual: an owned vector scene of an event night (a lit stage arch,
 * stadium floodlights, a crowd holding their phones up), drawn with flat shapes in the brand
 * colours. It is plainly an illustration: no photograph, no stock image, nothing that could pass
 * for an official picture of a real event.
 *
 * `children` is the ticket of the next real event. The poster and the ticket are ONE composition:
 *  - phones: the ticket sits INSIDE the poster's lower part, 12 px from its edges (so its corners
 *    are concentric with the poster's), the poster grows with the ticket's content, and the crowd
 *    layer is left out (behind the ticket it would only leak stray heads at the corners);
 *  - tablet: the ticket is pinned inside the poster's bottom-left corner;
 *  - desktop: the ticket deliberately hangs over the poster's left edge.
 *
 * Three depth layers move a few pixels against each other while the page scrolls (ScrollScene,
 * 'offset' mode): desktop pointers only, off with reduced motion.
 */
export default function HeroVisual({ children }: { children: ReactNode }) {
  return (
    <ScrollScene mode="offset" className="hero-visual">
      <div className="hero-art-frame">
        <svg className="hero-art" viewBox="0 0 640 720" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
          {/* Far: the stage arch and its rings */}
          <g className="hv-layer hv-far">
            <circle className="hv-line" cx="330" cy="520" r="470" />
            <circle className="hv-line" cx="330" cy="520" r="392" />
            <circle className="hv-sky" cx="330" cy="520" r="312" />
            <circle className="hv-ink-ring" cx="330" cy="520" r="236" />
            <circle className="hv-ink-ring" cx="330" cy="520" r="160" />
            <circle className="hv-mint" cx="330" cy="520" r="84" />
          </g>
          {/* Mid: floodlight masts and their beams */}
          <g className="hv-layer hv-mid">
            {/* Each mast is its own group: on narrow phones the stylesheet pulls them inwards so
                the crop of the drawing never cuts a lamp box. */}
            <g className="hv-mast-l">
              <path className="hv-beam" d="M72 150L128 150L470 760L-140 760Z" />
              <path className="hv-mast" d="M100 760V196" />
              <rect className="hv-lamp-box" x="58" y="108" width="84" height="60" rx="10" />
              <path className="hv-lamp" d="M78 128h.01M100 128h.01M122 128h.01M78 150h.01M100 150h.01M122 150h.01" />
            </g>
            <g className="hv-mast-r">
              <path className="hv-beam" d="M512 96L568 96L800 760L250 760Z" />
              <path className="hv-mast" d="M540 760V142" />
              <rect className="hv-lamp-box" x="498" y="54" width="84" height="60" rx="10" />
              <path className="hv-lamp" d="M518 74h.01M540 74h.01M562 74h.01M518 96h.01M540 96h.01M562 96h.01" />
            </g>
            <path className="hv-confetti-sky" d="M212 92h18v8h-18zM426 226h8v18h-8zM604 318h14v7h-14z" />
            <path className="hv-confetti-mint" d="M300 60h8v16h-8zM40 300h16v7H40zM470 166h14v7h-14z" />
            <path className="hv-confetti-white" d="M250 190h7v14h-7zM176 250h12v6h-12zM588 216h7v14h-7z" />
          </g>
          {/* Near: the crowd (tablet and desktop only, see home.css) */}
          <g className="hv-layer hv-near">
            {BACK.map(([x, y]) => (
              <path key={`b${x}`} className="hv-crowd-back" d={`M${x - 36} 760V${y + 54}Q${x - 36} ${y + 15} ${x} ${y + 15}Q${x + 36} ${y + 15} ${x + 36} ${y + 54}V760ZM${x} ${y - 17}a17 17 0 1 0 .01 0Z`} />
            ))}
            {FRONT.map(([x, y, arm]) => (
              <g key={`f${x}`}>
                <path className="hv-crowd" d={`M${x - 50} 780V${y + 74}Q${x - 50} ${y + 20} ${x} ${y + 20}Q${x + 50} ${y + 20} ${x + 50} ${y + 74}V780ZM${x} ${y - 23}a23 23 0 1 0 .01 0Z`} />
                {arm !== 0 ? (
                  <>
                    <path className="hv-arm" d={`M${x + arm * 40} ${y + 50}L${x + arm * 54} ${y - 46}`} />
                    <rect
                      className={arm === 1 ? 'hv-phone hv-phone-mint' : 'hv-phone hv-phone-white'}
                      x={x + arm * 54 - 11}
                      y={y - 88}
                      width="22"
                      height="38"
                      rx="5"
                    />
                  </>
                ) : null}
              </g>
            ))}
          </g>
        </svg>
        <span className="hero-art-cover" aria-hidden="true" />
      </div>
      <div className="hero-ticket-slot">{children}</div>
    </ScrollScene>
  );
}
