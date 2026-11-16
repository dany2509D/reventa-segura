import Image from 'next/image';
import { posterSerial, posterVariant, posterWords, type PosterMotif, type PosterVariant } from '@/lib/ui/poster';
import './poster.css';

/** A real photograph of the event. No event has one yet (there is no image field in the data). */
export type PosterImage = { src: string; alt: string };

type Props = {
  /** Event id: drives the deterministic palette and motif of the generative poster. */
  seed: string;
  /** Event name: the typographic crop is cut from it. */
  title: string;
  /** Override of the look derived from the id. */
  variant?: PosterVariant;
  /** When present it replaces the generative artwork (next/image, cover). */
  image?: PosterImage | null;
  size?: 'hero' | 'feature' | 'card' | 'thumb';
  /** next/image `sizes`, only used with `image`. */
  sizes?: string;
  priority?: boolean;
  className?: string;
};

/**
 * The visual of an event. With `image` it shows the photograph; without it, a generative poster:
 * owned, clearly illustrative artwork (flat geometry + the event's own name as type), never a
 * stand-in that could pass for a photo of the event. The generative poster is decorative
 * (aria-hidden): the event name is always real text beside it.
 */
export default function EventPoster({ seed, title, variant, image, size = 'card', sizes = '100vw', priority = false, className = '' }: Props) {
  const extra = className ? ` ${className}` : '';
  if (image) {
    return (
      <div className={`poster poster--photo poster--${size}${extra}`}>
        <Image className="poster-img" src={image.src} alt={image.alt} fill sizes={sizes} priority={priority} />
      </div>
    );
  }
  const v = variant ?? posterVariant(seed);
  const words = size === 'thumb' ? [] : posterWords(title);
  const marks = size === 'hero' || size === 'feature';
  return (
    <div className={`poster poster--${v.palette} poster--${v.motif} poster--${size}${v.flip ? ' is-flipped' : ''}${extra}`} aria-hidden="true">
      <Motif motif={v.motif} />
      {words.length > 0 ? (
        <div className="poster-type">
          {words.map((word, i) => (
            <span key={`${i}-${word}`} className={`poster-word poster-word--${i}`}>
              {word}
            </span>
          ))}
        </div>
      ) : null}
      {marks ? (
        <div className="poster-marks">
          <span>Ilustración</span>
          <span>{posterSerial(seed)}</span>
        </div>
      ) : null}
    </div>
  );
}

// Flat geometry on a 400 × 500 canvas, cropped to cover any aspect ratio. Shapes only (no SVG
// text, no filters, no ids): cheap to paint and safe to repeat many times on a page. All
// coordinates are literals, so the server and the browser render exactly the same markup.
// Colour roles: `pm-a` the large shape, `pm-b` the second shape, `pm-line` a quiet tone of the
// background. None of them is ever the colour of the type (see poster.css): a shape that shared it
// would swallow the letters it sits under.
const BARS: [x: number, y: number, h: number][] = [
  [22, 202, 96], [52, 156, 188], [82, 100, 300], [112, 175, 150], [142, 60, 380], [172, 119, 262], [202, 143, 214],
  [232, 80, 340], [262, 186, 128], [292, 127, 246], [322, 162, 176], [352, 204, 92], [382, 220, 60],
];
const RAYS =
  'M36 474L63 -306L134 -300ZM36 474L218 -284L286 -265ZM36 474L366 -233L428 -200ZM36 474L500 -153L555 -108Z' +
  'M36 474L616 -48L661 7ZM36 474L708 78L741 141ZM36 474L774 220L793 288ZM36 474L809 372L815 443Z';

function Motif({ motif }: { motif: PosterMotif }) {
  return (
    <svg className="poster-motif" viewBox="0 0 400 500" preserveAspectRatio="xMidYMid slice" focusable="false">
      {motif === 'arcos' ? (
        // Tiers of a stadium / rings of sound
        <>
          <circle className="pm-ring pm-s-line" cx="400" cy="500" r="352" strokeWidth="30" />
          <circle className="pm-ring pm-s-a" cx="400" cy="500" r="272" strokeWidth="30" />
          <circle className="pm-ring pm-s-b" cx="400" cy="500" r="192" strokeWidth="30" />
          <circle className="pm-a" cx="400" cy="500" r="116" />
          <circle className="pm-ring pm-s-a" cx="400" cy="500" r="432" strokeWidth="2" />
          <circle className="pm-b" cx="92" cy="118" r="28" />
        </>
      ) : null}
      {motif === 'focos' ? (
        // Stage lights
        <>
          <path className="pm-a" d="M96 -20L152 -20L336 520L-70 520Z" opacity="0.92" />
          <path className="pm-b" d="M262 -20L318 -20L480 520L110 520Z" opacity="0.78" />
          <path className="pm-ring pm-s-ink" d="M-10 46H410" strokeWidth="5" />
          <circle className="pm-ink" cx="124" cy="46" r="15" />
          <circle className="pm-ink" cx="290" cy="46" r="15" />
        </>
      ) : null}
      {motif === 'rayos' ? (
        // Floodlight burst
        <>
          <path className="pm-a" d={RAYS} />
          <circle className="pm-b" cx="36" cy="474" r="96" />
          <circle className="pm-ring pm-s-a" cx="36" cy="474" r="150" strokeWidth="2" />
        </>
      ) : null}
      {motif === 'trama' ? (
        // Halftone discs (the dot field itself is a CSS background)
        <>
          <circle className="pm-a" cx="262" cy="198" r="150" />
          <circle className="pm-b" cx="116" cy="372" r="66" />
          <path className="pm-ring pm-s-ink" d="M-20 478L420 258" strokeWidth="2.5" />
        </>
      ) : null}
      {motif === 'ondas' ? (
        // Waveform
        <>
          {BARS.map(([x, y, h], i) => (
            <rect key={x} className={i === 4 || i === 9 ? 'pm-b' : 'pm-a'} x={x} y={y} width="16" height={h} rx="8" />
          ))}
        </>
      ) : null}
      {motif === 'cancha' ? (
        // Pitch markings
        <g className="pm-ring pm-s-a pm-round" strokeWidth="5" transform="rotate(-18 200 250) translate(-40 -50) scale(1.2)">
          <rect x="40" y="20" width="320" height="460" rx="4" />
          <path d="M40 250H360M110 20V110H290V20M110 480V390H290V480M155 20V56H245V20M155 480V444H245V480M160 110A46 46 0 0 0 240 110M160 390A46 46 0 0 1 240 390" />
          <circle cx="200" cy="250" r="62" />
          <circle className="pm-b" cx="264" cy="208" r="20" stroke="none" />
          <circle className="pm-a" cx="200" cy="250" r="6" stroke="none" />
        </g>
      ) : null}
    </svg>
  );
}
