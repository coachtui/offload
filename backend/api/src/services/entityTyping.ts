/**
 * Entity typing from the parser's people list. The parser emits entities as
 * plain strings plus a `people` subset; membership (case-insensitive) is what
 * makes an entity a 'person' — everything else stays 'other' this slice.
 */
import type { Entity } from '../shared-types';

export function typeEntities(names: string[], people: string[]): Entity[] {
  const peopleSet = new Set(people.map((p) => p.toLowerCase()));
  return names.map((name) => ({
    type: peopleSet.has(name.toLowerCase()) ? ('person' as const) : ('other' as const),
    value: name,
    confidence: 1.0,
  }));
}

export function extractPeople(entities?: Entity[] | null): string[] {
  return (entities ?? []).filter((e) => e.type === 'person').map((e) => e.value);
}
