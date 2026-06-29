import { updateCategory, deleteCategory } from '../../services/categoryService';
import { UserCategoryModel } from '../../models/UserCategory';

jest.mock('../../models/UserCategory');
const mockModel = UserCategoryModel as jest.Mocked<typeof UserCategoryModel>;

describe('categoryService ownership', () => {
  beforeEach(() => jest.clearAllMocks());

  it('updateCategory throws "Category not found" when missing', async () => {
    mockModel.findById.mockResolvedValueOnce(null as any);
    await expect(updateCategory('u1', 'c1', { name: 'x' })).rejects.toThrow('Category not found');
  });

  it('updateCategory throws "Unauthorized" for another user\'s category', async () => {
    mockModel.findById.mockResolvedValueOnce({ id: 'c1', userId: 'someone-else' } as any);
    await expect(updateCategory('u1', 'c1', { name: 'x' })).rejects.toThrow('Unauthorized');
  });

  it('deleteCategory deletes when owned', async () => {
    mockModel.findById.mockResolvedValueOnce({ id: 'c1', userId: 'u1' } as any);
    mockModel.delete.mockResolvedValueOnce(undefined as any);
    await deleteCategory('u1', 'c1');
    expect(mockModel.delete).toHaveBeenCalledWith('c1');
  });
});
