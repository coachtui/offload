// backend/api/src/__tests__/routes/categories.test.ts
import express from 'express';
import request from 'supertest';

jest.mock('../../auth/middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => { req.user = { id: 'u1' }; next(); },
}));
jest.mock('../../services/categoryService');

import * as categoryService from '../../services/categoryService';
import categoryRoutes from '../../routes/categories';

const app = express();
app.use(express.json());
app.use('/api/v1/categories', categoryRoutes);

describe('categories routes', () => {
  beforeEach(() => jest.clearAllMocks());

  it('GET / lists categories', async () => {
    (categoryService.listCategories as jest.Mock).mockResolvedValue([{ id: 'c1', name: 'A' }]);
    const res = await request(app).get('/api/v1/categories');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ categories: [{ id: 'c1', name: 'A' }] });
  });

  it('POST / creates a category', async () => {
    (categoryService.createCategory as jest.Mock).mockResolvedValue({ id: 'c2', name: 'B' });
    const res = await request(app).post('/api/v1/categories').send({ name: 'B' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ category: { id: 'c2', name: 'B' } });
  });

  it('DELETE /:id maps "Category not found" to 404', async () => {
    (categoryService.deleteCategory as jest.Mock).mockRejectedValue(new Error('Category not found'));
    const res = await request(app).delete('/api/v1/categories/cX');
    expect(res.status).toBe(404);
  });
});
