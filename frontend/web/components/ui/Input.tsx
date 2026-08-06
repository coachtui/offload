'use client';

import { useId, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/**
 * Labeled text input on the Deep Lagoon surface. Renders a real, visible
 * <label>, wires aria-describedby to the error message, and passes every
 * native input attribute through (type, autoComplete, required, …).
 */
export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export default function Input({ label, error, id, className, ...rest }: InputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const errorId = `${inputId}-error`;

  return (
    <div className="w-full">
      <label
        htmlFor={inputId}
        className="block text-sm font-medium text-ink-secondary mb-1.5"
      >
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={cn(
          'w-full px-4 py-3 text-base text-ink bg-surface border rounded-md placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent disabled:opacity-50 transition-shadow',
          error ? 'border-danger-line' : 'border-line',
          className,
        )}
        {...rest}
      />
      {error && (
        <p id={errorId} role="alert" className="mt-1.5 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
