'use client'

/**
 * OffloadBackgroundPaths
 *
 * Brand illustration for the Offload hero section.
 * Visual narrative: Signal → Structure → Memory
 *                   (Capture)  (Organize)  (Recall)
 *
 * Layout — left to right across a 520 × 290 canvas:
 *   0 – 210   wave ribbon field (soft, organic signal)
 *   210 – 310 emergence zone — left node cluster
 *   310 – 520 right mesh network (organised memory)
 *
 * Motion is ambient and very restrained:
 *   • paths draw in on mount via pathLength
 *   • ribbons enter a slow, independent vertical drift
 *   • left and right node groups breathe with gentle opposite phase
 *   • one sea-teal accent node pulses softly every ~7 s
 *
 * Colors come from the Deep Lagoon tokens via Tailwind stroke/fill classes
 * (ink family for structure, accent for the insight node), so the
 * illustration follows light/dark automatically.
 *
 * Reduced-motion: all animation skipped; static composition retained.
 */

import { motion, useReducedMotion } from 'framer-motion'
import type { Transition } from 'framer-motion'
import type { CSSProperties } from 'react'
import { cn } from '@/lib/utils'

// ── Canvas ───────────────────────────────────────────────────────────────────
const VW = 520
const VH = 290

// ── Wave ribbon field ────────────────────────────────────────────────────────
// Two full sine cycles across x 0 → 210. Bezier C-points at ¼ and ¾ period
// give a natural smooth approximation without needing a computed point array.
function wavePath(cy: number, amp: number): string {
  return [
    `M 0,${cy}`,
    `C 26,${cy - amp}  79,${cy + amp}  105,${cy}`,
    `C 131,${cy - amp} 184,${cy + amp} 210,${cy}`,
  ].join(' ')
}

type WaveDef = {
  cy: number              // vertical centre
  amp: number             // oscillation amplitude
  sw: number              // stroke width (ribbon thickness)
  op: number              // resting opacity
  drift: [number, number] // idle y keyframe targets
  dd: number              // drift duration (s)
}

// Rendered back-to-front — outer wisps first, thick core last.
// Outer pair uses the muted ink tint for depth; core pair is full ink.
const WAVES: WaveDef[] = [
  { cy:  98, amp: 11, sw:  2,  op: 0.040, drift: [-2.5,  2.5], dd: 11.2 },
  { cy: 192, amp: 11, sw:  2,  op: 0.040, drift: [ 2.5, -2.5], dd: 11.8 },
  { cy: 114, amp: 16, sw:  4,  op: 0.075, drift: [-3.0,  3.0], dd:  9.5 },
  { cy: 176, amp: 16, sw:  4,  op: 0.075, drift: [ 3.0, -3.0], dd: 10.1 },
  { cy: 130, amp: 20, sw:  8,  op: 0.10,  drift: [-3.5,  4.0], dd:  8.3 },
  { cy: 160, amp: 20, sw:  8,  op: 0.10,  drift: [ 4.0, -3.5], dd:  8.8 },
  { cy: 145, amp: 22, sw: 16,  op: 0.09,  drift: [-2.5,  4.0], dd:  7.5 },
  { cy: 145, amp: 17, sw: 22,  op: 0.07,  drift: [ 4.0, -2.5], dd:  7.9 },
]

// Wave stroke classes — outer wisps muted, core strokes full ink
const WAVE_STROKE = [
  'stroke-ink-muted', 'stroke-ink-muted',
  'stroke-ink-secondary', 'stroke-ink-secondary',
  'stroke-ink', 'stroke-ink', 'stroke-ink', 'stroke-ink',
]

// ── Node / edge geometry ─────────────────────────────────────────────────────
type Pt = { x: number; y: number }
type NodeDef = Pt & { r: number; accent?: true }

// Left cluster — organic, emergent (signal crystallising into structure).
// One large visual anchor surrounded by irregularly placed smaller nodes.
const L_NODES: NodeDef[] = [
  { x: 210, y: 148, r:  6 },  // entry: wave terminus meets first node
  { x: 230, y: 114, r:  4 },
  { x: 248, y:  97, r:  5 },
  { x: 264, y: 146, r: 12 },  // anchor — largest in left cluster
  { x: 296, y: 112, r:  5 },
  { x: 304, y: 163, r:  7 },
  { x: 272, y: 192, r:  4 },
]

const L_EDGES: [number, number][] = [
  [0, 3], [1, 2], [1, 3], [2, 4], [3, 4], [3, 5], [3, 6], [5, 6],
]

// Right mesh — denser, more structured (organised memory).
// Three approximate rows with deliberate size variance;
// one sea-teal accent hub marks the "surfaced insight" node.
const R_NODES: NodeDef[] = [
  // top row
  { x: 338, y: 100, r:  5         },
  { x: 380, y:  85, r:  8         },
  { x: 422, y:  96, r:  4         },
  { x: 464, y:  87, r:  9         },
  // middle row — accent hub here
  { x: 332, y: 150, r:  6         },
  { x: 374, y: 147, r: 11, accent: true },  // Offload sea-teal accent
  { x: 414, y: 143, r:  5         },
  { x: 456, y: 150, r:  8         },
  // bottom row
  { x: 348, y: 200, r:  5         },
  { x: 390, y: 207, r:  6         },
  { x: 432, y: 199, r: 10         },
  { x: 470, y: 205, r:  4         },
]

// Primary structural edges — the main grid connections
const R_PRIMARY: [number, number][] = [
  [0, 1], [1, 2], [2, 3],           // top row
  [4, 5], [5, 6], [6, 7],           // middle row
  [8, 9], [9, 10], [10, 11],        // bottom row
  [0, 4], [1, 5], [2, 6], [3, 7],   // top → middle
  [4, 8], [5, 9], [6, 10], [7, 11], // middle → bottom
]

// Secondary web — thinner, lower opacity; adds depth without clutter
const R_SECONDARY: [number, number][] = [
  [1, 6], [0, 5], [2, 7], [5, 10], [6, 9],
]

// ── Helpers ──────────────────────────────────────────────────────────────────
const line = (a: Pt, b: Pt) => `M ${a.x},${a.y} L ${b.x},${b.y}`
const originAt = (x: number, y: number): { style: CSSProperties } => ({
  style: { transformOrigin: `${x}px ${y}px` },
})

// ── Props ────────────────────────────────────────────────────────────────────
export interface OffloadBackgroundPathsProps {
  /** Extra Tailwind / CSS classes on the root <svg> */
  className?: string
  /** Override reduced-motion behaviour (defaults to system preference) */
  reducedMotion?: boolean
  /** Enable the soft accent pulse on the insight node (default: true) */
  nodePulse?: boolean
}

// ── Component ────────────────────────────────────────────────────────────────
export function OffloadBackgroundPaths({
  className,
  reducedMotion,
  nodePulse = true,
}: OffloadBackgroundPathsProps) {
  const systemReduced = useReducedMotion()
  // explicit prop wins; fall back to system preference
  const skip = reducedMotion ?? systemReduced ?? false

  const tx = (t: Transition): Transition => (skip ? { duration: 0 } : t)

  return (
    <svg
      viewBox={`0 0 ${VW} ${VH}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      role="presentation"
      className={cn('w-full select-none', className)}
    >
      {/* ── Layer 1: Wave ribbon field ───────────────────────────────────
          Each ribbon draws in via pathLength, then enters a slow,
          independent vertical drift. Outer wisps and core use different
          stroke tints and opacities for layered depth.
      ─────────────────────────────────────────────────────────────────── */}
      {WAVES.map((w, i) => (
        <motion.path
          key={`w${i}`}
          d={wavePath(w.cy, w.amp)}
          className={WAVE_STROKE[i]}
          strokeWidth={w.sw}
          strokeLinecap="round"
          initial={skip ? false : { pathLength: 0, opacity: 0 }}
          animate={{
            pathLength: 1,
            opacity: w.op,
            y: skip ? 0 : [0, w.drift[0], 0, w.drift[1], 0],
          }}
          transition={{
            pathLength: tx({ duration: 1.6, ease: 'easeInOut', delay: i * 0.06 }),
            opacity:    tx({ duration: 1.4, ease: 'easeInOut', delay: i * 0.06 }),
            y: skip ? { duration: 0 } : {
              duration: w.dd,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: 2.4 + i * 0.18,
            },
          }}
        />
      ))}

      {/* Bridge filament — faint line connecting wave terminus to entry node.
          Draws in just before the left cluster appears, making the
          signal → structure transition legible. */}
      <motion.path
        d={`M 210,145 L ${L_NODES[0].x},${L_NODES[0].y}`}
        className="stroke-ink-muted"
        strokeWidth="0.7"
        strokeLinecap="round"
        strokeDasharray="3 4"
        initial={skip ? false : { pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 0.30 }}
        transition={tx({ duration: 0.5, ease: 'easeInOut', delay: 1.3 })}
      />

      {/* ── Layer 2: Left cluster (emergence) ───────────────────────────
          Group breathes gently after intro completes.
      ─────────────────────────────────────────────────────────────────── */}
      <motion.g
        animate={skip ? undefined : { y: [0, -2.5, 0, 2.5, 0] }}
        transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut', delay: 4.0 }}
      >
        {L_EDGES.map(([ai, bi], i) => (
          <motion.path
            key={`le${i}`}
            d={line(L_NODES[ai], L_NODES[bi])}
            className="stroke-ink-muted"
            strokeWidth="0.9"
            strokeLinecap="round"
            initial={skip ? false : { pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 0.48 }}
            transition={tx({ duration: 0.85, ease: 'easeInOut', delay: 1.65 + i * 0.09 })}
          />
        ))}

        {L_NODES.map((n, i) => (
          <motion.circle
            key={`ln${i}`}
            cx={n.x}
            cy={n.y}
            r={n.r}
            className="fill-ink-secondary"
            initial={skip ? false : { opacity: 0, scale: 0.25 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={tx({ duration: 0.55, ease: 'easeOut', delay: 1.4 + i * 0.09 })}
            {...originAt(n.x, n.y)}
          />
        ))}
      </motion.g>

      {/* ── Layer 3: Right mesh network (memory) ────────────────────────
          Draws in after left cluster: primary edges → nodes → secondary web.
          Group breathes on a slightly different phase to left cluster.
      ─────────────────────────────────────────────────────────────────── */}
      <motion.g
        animate={skip ? undefined : { y: [0, 3, 0, -3, 0] }}
        transition={{ duration: 10.5, repeat: Infinity, ease: 'easeInOut', delay: 4.5 }}
      >
        {/* Primary structural edges */}
        {R_PRIMARY.map(([ai, bi], i) => (
          <motion.path
            key={`rp${i}`}
            d={line(R_NODES[ai], R_NODES[bi])}
            className="stroke-ink-muted"
            strokeWidth="0.9"
            strokeLinecap="round"
            initial={skip ? false : { pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 0.45 }}
            transition={tx({ duration: 0.8, ease: 'easeInOut', delay: 2.4 + i * 0.07 })}
          />
        ))}

        {/* Secondary diagonal web — thinner, more transparent */}
        {R_SECONDARY.map(([ai, bi], i) => (
          <motion.path
            key={`rs${i}`}
            d={line(R_NODES[ai], R_NODES[bi])}
            className="stroke-ink-faint"
            strokeWidth="0.55"
            strokeLinecap="round"
            initial={skip ? false : { pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 0.25 }}
            transition={tx({ duration: 0.75, ease: 'easeInOut', delay: 3.6 + i * 0.1 })}
          />
        ))}

        {/* Nodes — rendered after edges so they sit on top */}
        {R_NODES.map((n, i) => (
          <g key={`rn${i}`}>
            {/* Accent pulse ring — ripples outward every ~7 s */}
            {n.accent && nodePulse && !skip && (
              <motion.circle
                cx={n.x}
                cy={n.y}
                r={n.r + 10}
                fill="none"
                className="stroke-accent"
                strokeWidth="1.5"
                animate={{ scale: [1, 1.65], opacity: [0.45, 0] }}
                transition={{
                  duration: 2.2,
                  repeat: Infinity,
                  repeatDelay: 5,
                  delay: 4.8,
                  ease: 'easeOut',
                }}
                {...originAt(n.x, n.y)}
              />
            )}

            {/* Node fill — accent hub uses the Offload sea-teal */}
            <motion.circle
              cx={n.x}
              cy={n.y}
              r={n.r}
              className={n.accent ? 'fill-accent' : 'fill-ink-secondary'}
              initial={skip ? false : { opacity: 0, scale: 0.25 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={tx({ duration: 0.55, ease: 'easeOut', delay: 2.55 + i * 0.07 })}
              {...originAt(n.x, n.y)}
            />
          </g>
        ))}
      </motion.g>
    </svg>
  )
}

export default OffloadBackgroundPaths
