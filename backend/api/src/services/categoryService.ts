import { z } from 'zod';
import { UserCategoryModel, UserCategory } from '../models/UserCategory';
import { AtomicObjectModel } from '../models/AtomicObject';
import { query } from '../db/queries';

const createCategorySchema = z.object({
  name: z.string().min(1, 'Name is required'),
  color: z.string().optional(),
  icon: z.string().nullable().optional(),
  keywords: z.array(z.string()).optional(),
  sortOrder: z.number().int().optional(),
});

export async function listCategories(userId: string): Promise<UserCategory[]> {
  const cats = await UserCategoryModel.findByUserId(userId);
  return cats.map((c) => c.toUserCategory());
}

export async function createCategory(
  userId: string,
  input: unknown
): Promise<UserCategory> {
  const parsed = createCategorySchema.parse(input);
  const cat = await UserCategoryModel.create(userId, parsed as { name: string; color?: string; icon?: string | null; keywords?: string[]; sortOrder?: number });
  return cat.toUserCategory();
}

export async function updateCategory(
  userId: string,
  id: string,
  updates: Partial<{ name: string; color: string; icon: string | null; keywords: string[]; sortOrder: number }>
): Promise<UserCategory> {
  const existing = await UserCategoryModel.findById(id);
  if (!existing) throw new Error('Category not found');
  if (existing.userId !== userId) throw new Error('Unauthorized');
  const updated = await UserCategoryModel.update(id, updates);
  return updated.toUserCategory();
}

export async function deleteCategory(userId: string, id: string): Promise<void> {
  const existing = await UserCategoryModel.findById(id);
  if (!existing) throw new Error('Category not found');
  if (existing.userId !== userId) throw new Error('Unauthorized');
  await UserCategoryModel.delete(id);
}

/**
 * Pure: first category (input order) with a keyword that is a case-insensitive
 * substring of `text`, else null.
 */
export function matchCategoryForText(
  categories: { id: string; keywords: string[] }[],
  text: string
): string | null {
  const haystack = (text || '').toLowerCase();
  for (const cat of categories) {
    for (const kw of cat.keywords ?? []) {
      const needle = kw.trim().toLowerCase();
      if (needle && haystack.includes(needle)) return cat.id;
    }
  }
  return null;
}

/**
 * Apply a user's keyword rules to a single object. No-op if no category matches.
 */
export async function applyRulesToObject(
  userId: string,
  objectId: string,
  text: string
): Promise<void> {
  const cats = await UserCategoryModel.findByUserId(userId);
  const matchId = matchCategoryForText(
    cats.map((c) => ({ id: c.id, keywords: c.keywords })),
    text
  );
  if (matchId) {
    await AtomicObjectModel.assignCategoryByRule(objectId, matchId);
  }
}

/**
 * Apply one category's keywords across the user's unlocked + uncategorized notes.
 */
export async function applyCategoryRules(
  userId: string,
  categoryId: string
): Promise<{ filed: number }> {
  const cat = await UserCategoryModel.findById(categoryId);
  if (!cat) throw new Error('Category not found');
  if (cat.userId !== userId) throw new Error('Unauthorized');

  const keywords = cat.keywords ?? [];
  if (keywords.length === 0) return { filed: 0 };

  // Build a case-insensitive OR of ILIKE patterns over title + content.
  const patterns = keywords.map((k) => `%${k.trim()}%`).filter((p) => p !== '%%');
  if (patterns.length === 0) return { filed: 0 };

  const ilikeClauses = patterns
    .map((_, idx) => `(COALESCE(title, '') || ' ' || content) ILIKE $${idx + 3}`)
    .join(' OR ');

  const result = await query(
    `UPDATE hub.atomic_objects
     SET category_id = $1
     WHERE user_id = $2
       AND category_id IS NULL
       AND category_locked = false
       AND deleted_at IS NULL
       AND (${ilikeClauses})`,
    [categoryId, userId, ...patterns]
  );
  return { filed: result.rowCount ?? 0 };
}
