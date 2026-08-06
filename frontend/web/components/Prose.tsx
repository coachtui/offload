import type { ReactNode } from 'react';

/**
 * Shared prose helpers for the legal pages (privacy, terms).
 */

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-lg font-semibold text-ink mb-4">{title}</h2>
      <div className="space-y-3 text-ink-secondary leading-relaxed text-sm">{children}</div>
    </section>
  );
}

export function Ul({ items }: { items: string[] }) {
  return (
    <ul className="list-disc list-inside space-y-1.5 text-ink-secondary text-sm ml-1">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}
