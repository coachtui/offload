import { z } from 'zod';
import { UserCategoryModel, UserCategory } from '../models/UserCategory';

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
