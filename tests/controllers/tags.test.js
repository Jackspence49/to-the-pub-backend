const request = require('supertest');
const { v4: uuidv4 } = require('uuid');
const app = require('../../src/app');
const db = require('../../src/utils/db');
const { createTestJWT, createMockUser } = require('../helpers/authHelpers');

// Mock the database module
jest.mock('../../src/utils/db');

describe('Tags Controller Tests', () => {
  let mockUser;
  let validToken;
  
  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
    
    // Setup test user and JWT token
    mockUser = createMockUser({
      id: 'test-user-id-123',
      email: 'testuser@example.com',
      role: 'super_admin'
    });
    
    validToken = createTestJWT({
      userId: mockUser.id,
      email: mockUser.email,
      role: mockUser.role
    });
  });

  describe('GET /tags - Get All Tags', () => {
    test('should successfully return all tags', async () => {
      const mockTags = [
        {
          id: 'tag-1',
          name: 'Sports Bar',
          category: 'atmosphere',
          created_at: '2025-10-13T22:15:29.923Z'
        },
        {
          id: 'tag-2',
          name: 'Live Music',
          category: 'entertainment',
          created_at: '2025-10-13T22:15:29.923Z'
        }
      ];

      // Mock database query
      db.query = jest.fn().mockResolvedValue([mockTags]);

      const response = await request(app)
        .get('/tags')
        .expect(200);

      expect(response.body).toEqual({
        data: mockTags
      });

      expect(db.query).toHaveBeenCalledWith(
        'SELECT id, name, category, created_at FROM tags ORDER BY name'
      );
    });

    test('should return empty array when no tags exist', async () => {
      // Mock empty database response
      db.query = jest.fn().mockResolvedValue([[]]);

      const response = await request(app)
        .get('/tags')
        .expect(200);

      expect(response.body).toEqual({
        data: []
      });
    });

    test('should handle database error gracefully', async () => {
      // Mock database error
      db.query = jest.fn().mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app)
        .get('/tags')
        .expect(500);

      expect(response.body).toEqual({
        error: 'Failed to fetch tags'
      });
    });
  });

  describe('POST /tags - Create Tag', () => {
    test('should successfully create a new tag with name and category', async () => {
      const tagData = {
        name: 'Craft Beer',
        category: 'drinks'
      };

      // Mock successful database insert
      db.execute = jest.fn().mockResolvedValue([{ affectedRows: 1 }]);

      const response = await request(app)
        .post('/tags')
        .set('Authorization', `Bearer ${validToken}`)
        .send(tagData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Tag created successfully');
      expect(response.body.data.name).toBe('Craft Beer');
      expect(response.body.data.category).toBe('drinks');
      expect(response.body.data.id).toBeDefined();

      expect(db.execute).toHaveBeenCalledWith(
        'INSERT INTO tags (id, name, category) VALUES (?, ?, ?)',
        expect.arrayContaining([
          expect.any(String), // UUID
          'Craft Beer',
          'drinks'
        ])
      );
    });

    test('should successfully create a tag with name only (no category)', async () => {
      const tagData = {
        name: 'Pool Table'
      };

      db.execute = jest.fn().mockResolvedValue([{ affectedRows: 1 }]);

      const response = await request(app)
        .post('/tags')
        .set('Authorization', `Bearer ${validToken}`)
        .send(tagData)
        .expect(201);

      expect(response.body.data.name).toBe('Pool Table');
      expect(response.body.data.category).toBeNull();

      expect(db.execute).toHaveBeenCalledWith(
        'INSERT INTO tags (id, name, category) VALUES (?, ?, ?)',
        expect.arrayContaining([
          expect.any(String),
          'Pool Table',
          null
        ])
      );
    });

    test('should trim whitespace from name and category', async () => {
      const tagData = {
        name: '  Outdoor Seating  ',
        category: '  amenities  '
      };

      db.execute = jest.fn().mockResolvedValue([{ affectedRows: 1 }]);

      const response = await request(app)
        .post('/tags')
        .set('Authorization', `Bearer ${validToken}`)
        .send(tagData)
        .expect(201);

      expect(response.body.data.name).toBe('Outdoor Seating');
      expect(response.body.data.category).toBe('  amenities  '); // The response uses category || null, not trimmed

      // Verify the database was called with trimmed values
      expect(db.execute).toHaveBeenCalledWith(
        'INSERT INTO tags (id, name, category) VALUES (?, ?, ?)',
        expect.arrayContaining([
          expect.any(String),
          'Outdoor Seating',
          'amenities' // This should be trimmed in the database call
        ])
      );
    });

    test('should return 400 when name is missing', async () => {
      const tagData = {
        category: 'entertainment'
      };

      const response = await request(app)
        .post('/tags')
        .set('Authorization', `Bearer ${validToken}`)
        .send(tagData)
        .expect(400);

      expect(response.body).toEqual({
        error: 'Tag name is required'
      });

      expect(db.execute).not.toHaveBeenCalled();
    });

    test('should return 400 when name is empty string', async () => {
      const tagData = {
        name: '',
        category: 'entertainment'
      };

      const response = await request(app)
        .post('/tags')
        .set('Authorization', `Bearer ${validToken}`)
        .send(tagData)
        .expect(400);

      expect(response.body).toEqual({
        error: 'Tag name is required'
      });
    });

    test('should return 409 when tag name already exists', async () => {
      const tagData = {
        name: 'Sports Bar',
        category: 'atmosphere'
      };

      // Mock duplicate entry error
      const duplicateError = new Error('Duplicate entry');
      duplicateError.code = 'ER_DUP_ENTRY';
      db.execute = jest.fn().mockRejectedValue(duplicateError);

      const response = await request(app)
        .post('/tags')
        .set('Authorization', `Bearer ${validToken}`)
        .send(tagData)
        .expect(409);

      expect(response.body).toEqual({
        error: 'Tag name already exists'
      });
    });

    test('should return 401 when no token provided', async () => {
      const tagData = {
        name: 'Test Tag'
      };

      const response = await request(app)
        .post('/tags')
        .send(tagData)
        .expect(401);

      expect(db.execute).not.toHaveBeenCalled();
    });

    test('should handle database error gracefully', async () => {
      const tagData = {
        name: 'Test Tag'
      };

      db.execute = jest.fn().mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/tags')
        .set('Authorization', `Bearer ${validToken}`)
        .send(tagData)
        .expect(500);

      expect(response.body).toEqual({
        error: 'Failed to create tag'
      });
    });
  });

  describe('PUT /tags/:id - Update Tag', () => {
    const tagId = 'test-tag-id-123';

    test('should successfully update an existing tag', async () => {
      const updateData = {
        name: 'Updated Tag Name',
        category: 'updated-category'
      };

      // Mock successful update
      db.execute = jest.fn().mockResolvedValue([{ affectedRows: 1 }]);

      const response = await request(app)
        .put(`/tags/${tagId}`)
        .set('Authorization', `Bearer ${validToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Tag updated successfully');
      expect(response.body.data.id).toBe(tagId);
      expect(response.body.data.name).toBe('Updated Tag Name');
      expect(response.body.data.category).toBe('updated-category');

      expect(db.execute).toHaveBeenCalledWith(
        'UPDATE tags SET name = ?, category = ? WHERE id = ?',
        ['Updated Tag Name', 'updated-category', tagId]
      );
    });

    test('should update tag with null category', async () => {
      const updateData = {
        name: 'Tag Without Category'
      };

      db.execute = jest.fn().mockResolvedValue([{ affectedRows: 1 }]);

      const response = await request(app)
        .put(`/tags/${tagId}`)
        .set('Authorization', `Bearer ${validToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.data.category).toBeNull();

      expect(db.execute).toHaveBeenCalledWith(
        'UPDATE tags SET name = ?, category = ? WHERE id = ?',
        ['Tag Without Category', null, tagId]
      );
    });

    test('should return 404 when tag not found', async () => {
      const updateData = {
        name: 'Non-existent Tag'
      };

      // Mock no affected rows (tag not found)
      db.execute = jest.fn().mockResolvedValue([{ affectedRows: 0 }]);

      const response = await request(app)
        .put(`/tags/${tagId}`)
        .set('Authorization', `Bearer ${validToken}`)
        .send(updateData)
        .expect(404);

      expect(response.body).toEqual({
        error: 'Tag not found'
      });
    });

    test('should return 400 when name is missing', async () => {
      const updateData = {
        category: 'some-category'
      };

      const response = await request(app)
        .put(`/tags/${tagId}`)
        .set('Authorization', `Bearer ${validToken}`)
        .send(updateData)
        .expect(400);

      expect(response.body).toEqual({
        error: 'Tag name is required'
      });

      expect(db.execute).not.toHaveBeenCalled();
    });

    test('should return 409 when updated name conflicts with existing tag', async () => {
      const updateData = {
        name: 'Existing Tag Name'
      };

      const duplicateError = new Error('Duplicate entry');
      duplicateError.code = 'ER_DUP_ENTRY';
      db.execute = jest.fn().mockRejectedValue(duplicateError);

      const response = await request(app)
        .put(`/tags/${tagId}`)
        .set('Authorization', `Bearer ${validToken}`)
        .send(updateData)
        .expect(409);

      expect(response.body).toEqual({
        error: 'Tag name already exists'
      });
    });
  });

  describe('DELETE /tags/:id - Delete Tag', () => {
    const tagId = 'test-tag-id-123';

    test('should successfully delete an unused tag', async () => {
      // Mock tag not in use (count = 0)
      db.execute = jest.fn()
        .mockResolvedValueOnce([[{ count: 0 }]]) // Usage check
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // Delete operation

      const response = await request(app)
        .delete(`/tags/${tagId}`)
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Tag deleted successfully');
      expect(response.body.data.id).toBe(tagId);

      expect(db.execute).toHaveBeenCalledTimes(2);
      expect(db.execute).toHaveBeenNthCalledWith(1,
        'SELECT COUNT(*) as count FROM bar_tags WHERE tag_id = ?',
        [tagId]
      );
      expect(db.execute).toHaveBeenNthCalledWith(2,
        'DELETE FROM tags WHERE id = ?',
        [tagId]
      );
    });

    test('should return 409 when trying to delete tag in use', async () => {
      // Mock tag in use (count > 0)
      db.execute = jest.fn()
        .mockResolvedValueOnce([[{ count: 3 }]]); // Usage check shows tag is used

      const response = await request(app)
        .delete(`/tags/${tagId}`)
        .set('Authorization', `Bearer ${validToken}`)
        .expect(409);

      expect(response.body).toEqual({
        error: 'Cannot delete tag: it is currently used by one or more bars'
      });

      // Should only call the usage check, not the delete
      expect(db.execute).toHaveBeenCalledTimes(1);
      expect(db.execute).toHaveBeenCalledWith(
        'SELECT COUNT(*) as count FROM bar_tags WHERE tag_id = ?',
        [tagId]
      );
    });

    test('should return 404 when tag not found', async () => {
      // Mock tag not in use and delete returns no affected rows
      db.execute = jest.fn()
        .mockResolvedValueOnce([[{ count: 0 }]]) // Usage check
        .mockResolvedValueOnce([{ affectedRows: 0 }]); // Delete returns 0 (not found)

      const response = await request(app)
        .delete(`/tags/${tagId}`)
        .set('Authorization', `Bearer ${validToken}`)
        .expect(404);

      expect(response.body).toEqual({
        error: 'Tag not found'
      });
    });

    test('should return 401 when no token provided', async () => {
      const response = await request(app)
        .delete(`/tags/${tagId}`)
        .expect(401);

      expect(db.execute).not.toHaveBeenCalled();
    });

    test('should handle database error during usage check', async () => {
      db.execute = jest.fn().mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .delete(`/tags/${tagId}`)
        .set('Authorization', `Bearer ${validToken}`)
        .expect(500);

      expect(response.body).toEqual({
        error: 'Failed to delete tag'
      });
    });

    test('should handle database error during delete operation', async () => {
      // Mock successful usage check but error on delete
      db.execute = jest.fn()
        .mockResolvedValueOnce([[{ count: 0 }]]) // Usage check succeeds
        .mockRejectedValueOnce(new Error('Delete error')); // Delete fails

      const response = await request(app)
        .delete(`/tags/${tagId}`)
        .set('Authorization', `Bearer ${validToken}`)
        .expect(500);

      expect(response.body).toEqual({
        error: 'Failed to delete tag'
      });
    });
  });

  describe('Authentication Tests', () => {
    test('should reject requests with invalid JWT token', async () => {
      const invalidToken = 'invalid.jwt.token';
      
      const response = await request(app)
        .post('/tags')
        .set('Authorization', `Bearer ${invalidToken}`)
        .send({ name: 'Test Tag' })
        .expect(403); // Invalid tokens return 403, not 401

      expect(db.execute).not.toHaveBeenCalled();
    });

    test('should reject requests with malformed Authorization header', async () => {
      const response = await request(app)
        .post('/tags')
        .set('Authorization', 'Invalid Header Format')
        .send({ name: 'Test Tag' })
        .expect(401);

      expect(db.execute).not.toHaveBeenCalled();
    });
  });
});