import type { Category } from './model.js';

/** Lookup index keyed by category id. */
export type CategoryIndex = ReadonlyMap<string, Category>;

/**
 * A category followed by its ancestors, nearest first. Self-referencing or
 * cyclic parent links are cut off by the seen-set, so a corrupt row can never
 * spin forever.
 */
export function categoryPath(index: CategoryIndex, id: string | null | undefined): Category[] {
  const path: Category[] = [];
  const seen = new Set<string>();
  let current = id ? index.get(id) : undefined;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.push(current);
    current = current.parentId ? index.get(current.parentId) : undefined;
  }
  return path;
}

/** True when `id` is `ancestorId` itself or sits anywhere underneath it. */
export function isSelfOrDescendant(index: CategoryIndex, id: string, ancestorId: string): boolean {
  return categoryPath(index, id).some((c) => c.id === ancestorId);
}

/** Owning major of a category; the category itself when it already is one. */
export function majorOf(index: CategoryIndex, id: string | null | undefined): Category | undefined {
  return categoryPath(index, id).find((c) => c.level === 'major');
}

/** Nearest subject at or above a category; the category itself when it is one. */
export function subjectOf(index: CategoryIndex, id: string | null | undefined): Category | undefined {
  return categoryPath(index, id).find((c) => c.level === 'subject');
}
