import type { SVGProps } from 'react';

/**
 * Single icon module for the web app — consistent 1.8-stroke outline set.
 * All icons are decorative by default (aria-hidden); size them with
 * width/height classes and color them with text-* (stroke = currentColor).
 * Any default can be overridden via props.
 */

export type IconProps = SVGProps<SVGSVGElement>;

const strokeDefaults = {
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

export function MicIcon(props: IconProps) {
  return (
    <svg {...strokeDefaults} {...props}>
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

export function SparkleIcon(props: IconProps) {
  return (
    <svg {...strokeDefaults} {...props}>
      <path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z" />
    </svg>
  );
}

export function LocationIcon(props: IconProps) {
  return (
    <svg {...strokeDefaults} {...props}>
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <svg {...strokeDefaults} {...props}>
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...strokeDefaults} {...props}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <svg {...strokeDefaults} {...props}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

export function ShieldIcon(props: IconProps) {
  return (
    <svg {...strokeDefaults} {...props}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

/** Apple logo — solid glyph (no stroke). */
export function AppleIcon(props: IconProps) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      {...props}
    >
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  );
}

/** Offload brand mark — the vessel glyph (thoughts distilled). Viewbox 96. */
export function LogoGlyph(props: IconProps) {
  return (
    <svg
      width={24}
      height={24}
      viewBox="0 0 96 96"
      fill="none"
      stroke="currentColor"
      strokeWidth={8}
      strokeLinecap="round"
      aria-hidden
      {...props}
    >
      <path d="M26 30 L26 50 A22 22 0 0 0 70 50 L70 30" />
      <line x1="38" y1="48" x2="58" y2="48" />
      <line x1="42" y1="60" x2="54" y2="60" />
    </svg>
  );
}

/** Full brand mark — thought-strands flowing into the vessel. Viewbox 96. */
export function LogoMark(props: IconProps) {
  return (
    <svg
      width={32}
      height={32}
      viewBox="0 0 96 96"
      fill="none"
      stroke="currentColor"
      strokeWidth={7}
      strokeLinecap="round"
      aria-hidden
      {...props}
    >
      <circle cx="12" cy="14" r="3.5" fill="currentColor" stroke="none" />
      <circle cx="22" cy="7" r="2.5" fill="currentColor" stroke="none" />
      <path d="M22 20 C36 14 40 26 54 22" strokeWidth={5.5} />
      <path d="M34 32 C46 27 50 36 62 32" strokeWidth={5.5} />
      <path d="M26 36 L26 52 A22 22 0 0 0 70 52 L70 36" />
      <line x1="38" y1="50" x2="58" y2="50" strokeWidth={5.5} />
      <line x1="42" y1="60" x2="54" y2="60" strokeWidth={5.5} />
    </svg>
  );
}
