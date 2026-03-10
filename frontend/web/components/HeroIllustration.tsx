'use client'

import { motion, useReducedMotion } from 'framer-motion'
import type { TargetAndTransition, Transition } from 'framer-motion'
import type { CSSProperties } from 'react'

// ── Canvas ─────────────────────────────────────────────────────────────────
const VW = 520
const VH = 290

// ── Wave ribbon (5 layered sine paths, entering from left) ─────────────────
// Each path ends near x≈172 where the left cluster begins.
const WAVES = [
  // center — most opaque, heaviest stroke
  {
    d: 'M 0,145 C 20,122 40,168 60,145 C 80,122 100,168 120,145 C 140,122 160,168 172,148',
    opacity: 0.85,
    strokeWidth: 1.3,
  },
  // one above center
  {
    d: 'M 4,130 C 24,108 44,152 64,130 C 84,108 104,152 124,130 C 144,108 160,128 170,136',
    opacity: 0.6,
    strokeWidth: 1.0,
  },
  // one below center
  {
    d: 'M 4,160 C 24,138 44,182 64,160 C 84,138 104,182 124,160 C 144,138 160,164 170,155',
    opacity: 0.6,
    strokeWidth: 1.0,
  },
  // outer above
  {
    d: 'M 10,114 C 30,93 50,135 70,114 C 90,93 110,135 132,114',
    opacity: 0.35,
    strokeWidth: 0.8,
  },
  // outer below
  {
    d: 'M 10,176 C 30,155 50,197 70,176 C 90,155 110,197 132,176',
    opacity: 0.35,
    strokeWidth: 0.8,
  },
]

// ── Left cluster — sparse, organic (signal arrives → nodes appear) ──────────
type Pt = { x: number; y: number }

const L_NODES: Array<Pt & { r: number }> = [
  { x: 205, y: 118, r: 5 },
  { x: 190, y: 155, r: 7 },  // entry — largest on left edge
  { x: 242, y: 103, r: 4 },
  { x: 262, y: 148, r: 9 },  // center hub of left cluster
  { x: 300, y: 126, r: 5 },
  { x: 297, y: 174, r: 5 },
  { x: 238, y: 192, r: 4 },
]

// Pairs of L_NODES indices
const L_EDGE_IDX = [
  [0, 1], [0, 2], [1, 3], [2, 3], [3, 4], [3, 5], [3, 6], [5, 6],
]

// ── Right cluster — dense, structured (organised memory) ───────────────────
const R_NODES: Array<Pt & { r: number; hub?: boolean }> = [
  { x: 345, y: 100, r: 5 },
  { x: 387, y: 88,  r: 6 },
  { x: 430, y: 97,  r: 4 },
  { x: 470, y: 90,  r: 7 },
  { x: 333, y: 147, r: 6 },
  { x: 376, y: 150, r: 9, hub: true },  // primary hub — indigo
  { x: 420, y: 144, r: 5 },
  { x: 463, y: 149, r: 6 },
  { x: 350, y: 200, r: 5 },
  { x: 392, y: 208, r: 5 },
  { x: 437, y: 199, r: 7 },
]

const R_EDGE_IDX = [
  // top row
  [0, 1], [1, 2], [2, 3],
  // middle row
  [4, 5], [5, 6], [6, 7],
  // bottom row
  [8, 9], [9, 10],
  // top → middle
  [0, 4], [1, 5], [2, 6], [3, 7],
  // middle → bottom
  [4, 8], [5, 9], [6, 10],
]

// ── Helpers ────────────────────────────────────────────────────────────────
function linePath(a: Pt, b: Pt) {
  return `M ${a.x},${a.y} L ${b.x},${b.y}`
}

function originAt(x: number, y: number): { style: CSSProperties } {
  return { style: { transformOrigin: `${x}px ${y}px` } }
}

// ── Transition factories ───────────────────────────────────────────────────
const pathTx = (delay: number) => ({
  duration: 0.85,
  ease: 'easeInOut' as const,
  delay,
})

const nodeTx = (delay: number) => ({
  duration: 0.55,
  ease: 'easeOut' as const,
  delay,
})

// ── Component ──────────────────────────────────────────────────────────────
export default function HeroIllustration() {
  const reducedMotion = useReducedMotion()
  const skip = reducedMotion ?? false

  // Wrap helpers — skip=true → instant (no tween), skip=false → animated
  const wInit = (vals: TargetAndTransition): TargetAndTransition | false => (skip ? false : vals)
  const wTx = (tx: Transition): Transition => (skip ? { duration: 0 } : tx)

  return (
    <svg
      viewBox={`0 0 ${VW} ${VH}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      role="presentation"
      className="w-full select-none"
    >
      {/* ── Wave ribbon ────────────────────────────────────────────────── */}
      {WAVES.map((w, i) => (
        <motion.path
          key={`wave-${i}`}
          d={w.d}
          stroke="#334155"
          strokeWidth={w.strokeWidth}
          strokeLinecap="round"
          initial={wInit({ pathLength: 0, opacity: 0 })}
          animate={{ pathLength: 1, opacity: w.opacity }}
          transition={wTx({ duration: 1.3, ease: 'easeInOut', delay: i * 0.08 })}
        />
      ))}

      {/* ── Network (floats after intro) ────────────────────────────── */}
      <motion.g
        animate={skip ? undefined : { y: [0, -4, 0, 4, 0] }}
        transition={{ delay: 3.5, duration: 7, repeat: Infinity, ease: 'easeInOut' }}
      >
        {/* ── Left cluster connections ──────────────────────────────── */}
        {L_EDGE_IDX.map(([ai, bi], i) => (
          <motion.path
            key={`le-${i}`}
            d={linePath(L_NODES[ai], L_NODES[bi])}
            stroke="#94a3b8"
            strokeWidth="0.9"
            strokeLinecap="round"
            initial={wInit({ pathLength: 0, opacity: 0 })}
            animate={{ pathLength: 1, opacity: 0.55 }}
            transition={wTx(pathTx(1.45 + i * 0.1))}
          />
        ))}

        {/* ── Left cluster nodes ────────────────────────────────────── */}
        {L_NODES.map((n, i) => (
          <motion.circle
            key={`ln-${i}`}
            cx={n.x}
            cy={n.y}
            r={n.r}
            fill="#475569"
            initial={wInit({ opacity: 0, scale: 0.4 })}
            animate={{ opacity: 1, scale: 1 }}
            transition={wTx(nodeTx(1.2 + i * 0.08))}
            {...originAt(n.x, n.y)}
          />
        ))}

        {/* ── Right cluster connections ─────────────────────────────── */}
        {R_EDGE_IDX.map(([ai, bi], i) => (
          <motion.path
            key={`re-${i}`}
            d={linePath(R_NODES[ai], R_NODES[bi])}
            stroke="#94a3b8"
            strokeWidth="0.9"
            strokeLinecap="round"
            initial={wInit({ pathLength: 0, opacity: 0 })}
            animate={{ pathLength: 1, opacity: 0.55 }}
            transition={wTx(pathTx(2.4 + i * 0.09))}
          />
        ))}

        {/* ── Right cluster nodes ───────────────────────────────────── */}
        {R_NODES.map((n, i) => (
          <g key={`rn-${i}`}>
            {/* Hub ring */}
            {n.hub && (
              <motion.circle
                cx={n.x}
                cy={n.y}
                r={n.r + 8}
                stroke="#a5b4fc"
                strokeWidth="1"
                initial={wInit({ opacity: 0, scale: 0.5 })}
                animate={{ opacity: 0.35, scale: 1 }}
                transition={wTx(nodeTx(2.15 + i * 0.08))}
                {...originAt(n.x, n.y)}
              />
            )}
            <motion.circle
              cx={n.x}
              cy={n.y}
              r={n.r}
              fill={n.hub ? '#4f46e5' : '#475569'}
              initial={wInit({ opacity: 0, scale: 0.4 })}
              animate={{ opacity: 1, scale: 1 }}
              transition={wTx(nodeTx(2.2 + i * 0.08))}
              {...originAt(n.x, n.y)}
            />
          </g>
        ))}
      </motion.g>
    </svg>
  )
}
