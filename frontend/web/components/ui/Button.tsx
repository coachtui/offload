import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/**
 * Deep Lagoon button primitive.
 *
 * Variants:
 *   primary — ink on bg (the main CTA; slight lift on hover)
 *   accent  — sea-teal fill, white text
 *   tonal   — accent tint surface with accent text + hairline
 *   ghost   — quiet text-only action
 *
 * `buttonClasses()` is exported so <Link> elements can share the exact
 * same styling without wrapping a button in an anchor.
 */

export type ButtonVariant = 'primary' | 'accent' | 'tonal' | 'ghost';
export type ButtonSize = 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-ink text-bg hover:-translate-y-0.5 hover:shadow-level2 active:translate-y-0 active:shadow-none',
  accent: 'bg-accent text-white hover:opacity-90',
  tonal: 'bg-accent-tint text-accent border border-accent-line hover:border-accent',
  ghost: 'bg-transparent text-ink-muted hover:text-ink hover:bg-surface-muted',
};

const SIZES: Record<ButtonSize, string> = {
  md: 'px-5 py-2.5 text-sm rounded-sm',
  lg: 'px-8 py-3.5 text-base rounded-md',
};

export function buttonClasses(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  className?: string,
): string {
  return cn(
    'inline-flex items-center justify-center gap-2 font-semibold select-none transition-all duration-150 disabled:opacity-50 disabled:pointer-events-none',
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin w-4 h-4"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner, disables the button, and sets aria-busy. */
  loading?: boolean;
}

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses(variant, size, className)}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}
