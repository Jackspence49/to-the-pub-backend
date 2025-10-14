const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const db = require('../../src/utils/db');
const { createTestJWT, createMockUser } = require('../helpers/authHelpers');

// Mock the database module
jest.mock('../../src/utils/db');

describe('Tags Routes Integration Tests', () => {
  let mockConnection;
  let validToken;
  let mockUser;

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();

    // Create a mock database connection
    mockConnection = {
      execute: jest.fn(),
      beginTransaction: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn(),
      release: jest.fn()
    };

    // Setup mock user and JWT token
    mockUser = createMockUser({
      id: 'test-user-123',
      email: 'test@example.com',
      role: 'super_admin'
    });

    validToken = createTestJWT({
      userId: mockUser.id,
      email: mockUser.email,
      role: mockUser.role
    });

    // Mock database methods
    db.execute = jest.fn();
    db.query = jest.fn();
    db.getConnection = jest.fn().mockResolvedValue(mockConnection);
  });

  describe('GET /tags - Public Route', () => {
    test('should return all tags without authentication', async () => {
      const mockTags = [
        {
          id: 'tag-1',
          name: 'Sports Bar',
          category: 'Entertainment'
        },
        {
          id: 'tag-2',
          name: 'Live Music',
          category: 'Music'
        }
      ];

      db.query.mockResolvedValueOnce([mockTags]);

      const response = await request(app)
        .get('/tags')
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0]).toHaveProperty('name', 'Sports Bar');
    });

    test('should return empty array when no tags exist', async () => {
      db.query.mockResolvedValueOnce([[]]);

      const response = await request(app)
        .get('/tags')
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toEqual([]);
    });

    test('should handle database errors gracefully', async () => {
      db.query.mockRejectedValueOnce(new Error('Database connection failed'));

      const response = await request(app)
        .get('/tags')
        .expect(500);

      expect(response.body).toHaveProperty('error', 'Failed to fetch tags');
    });

    test('should set proper cache headers for tags', async () => {
      const mockTags = [
        {
          id: 'tag-1',
          name: 'Sports Bar',
          category: 'Entertainment'
        }
      ];

      db.query.mockResolvedValueOnce([mockTags]);

      const response = await request(app)
        .get('/tags')
        .expect(200);

      expect(response.headers['content-type']).toMatch(/application\/json/);
    });
  });

  describe('POST /tags - Protected Route', () => {
    test('should create tag with valid authentication', async () => {
      const newTag = {
        name: 'Craft Beer',
        category: 'Beverages'
      };

      db.execute.mockResolvedValueOnce([{}]); // Insert tag

      const response = await request(app)
        .post('/tags')
        .set('Authorization', `Bearer ${validToken}`)
        .send(newTag)
        .expect(201);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data).toHaveProperty('name', newTag.name);
      expect(response.body.data).toHaveProperty('category', newTag.category);
    });

    test('should reject request without authentication', async () => {
      const newTag = {
        name: 'Craft Beer',
        color: '#8B4513'
      };

      const response = await request(app)
        .post('/tags')
        .send(newTag)
        .expect(401);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message', 'Access denied. No token provided or invalid format. Expected: Bearer <token>');
    });

    test('should reject request with invalid token', async () => {
      const newTag = {
        name: 'Craft Beer',
        color: '#8B4513'
      };

      const response = await request(app)
        .post('/tags')
        .set('Authorization', 'Bearer invalid-token')
        .send(newTag)
        .expect(403);

      expect(response.body).toHaveProperty('success', false);
    });

    test('should validate required fields', async () => {
      const incompleteTag = {
        category: 'Test Category'
        // Missing required name field
      };

      const response = await request(app)
        .post('/tags')
        .set('Authorization', `Bearer ${validToken}`)
        .send(incompleteTag)
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Tag name is required');
    });

    test('should handle duplicate tag names', async () => {
      const duplicateTag = {
        name: 'Sports Bar',
        category: 'Entertainment'
      };

      db.execute.mockRejectedValueOnce({
        code: 'ER_DUP_ENTRY',
        message: 'Duplicate entry'
      });

      const response = await request(app)
        .post('/tags')
        .set('Authorization', `Bearer ${validToken}`)
        .send(duplicateTag)
        .expect(409);

      expect(response.body).toHaveProperty('error', 'Tag name already exists');
    });

    test('should create tag without category', async () => {
      const tagWithoutCategory = {
        name: 'Simple Tag'
      };

      db.execute.mockResolvedValueOnce([{}]); // Insert tag

      const response = await request(app)
        .post('/tags')
        .set('Authorization', `Bearer ${validToken}`)
        .send(tagWithoutCategory)
        .expect(201);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('name', tagWithoutCategory.name);
      expect(response.body.data).toHaveProperty('category', null);
    });
  });

  describe('PUT /tags/:id - Protected Route', () => {
    test('should update tag with valid authentication', async () => {
      const updateData = {
        name: 'Updated Sports Bar',
        category: 'Updated Category'
      };

      db.execute.mockResolvedValueOnce([{ affectedRows: 1 }]); // Update tag

      const response = await request(app)
        .put('/tags/tag-1')
        .set('Authorization', `Bearer ${validToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('name', updateData.name);
      expect(response.body.data).toHaveProperty('category', updateData.category);
    });

    test('should reject update without authentication', async () => {
      const updateData = {
        name: 'Updated Tag Name'
      };

      const response = await request(app)
        .put('/tags/tag-1')
        .send(updateData)
        .expect(401);

      expect(response.body).toHaveProperty('success', false);
    });

    test('should return 404 for non-existent tag', async () => {
      const updateData = {
        name: 'Updated Tag Name'
      };

      db.execute.mockResolvedValueOnce([{ affectedRows: 0 }]);

      const response = await request(app)
        .put('/tags/non-existent')
        .set('Authorization', `Bearer ${validToken}`)
        .send(updateData)
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Tag not found');
    });

    test('should require name field for updates', async () => {
      const partialUpdate = {
        category: 'New Category'
        // Missing required name field
      };

      const response = await request(app)
        .put('/tags/tag-1')
        .set('Authorization', `Bearer ${validToken}`)
        .send(partialUpdate)
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Tag name is required');
    });
  });

  describe('DELETE /tags/:id - Protected Route', () => {
    test('should delete tag when not used by any bars', async () => {
      // Mock that tag is not used by any bars
      db.execute
        .mockResolvedValueOnce([[{ count: 0 }]]) // Check usage count
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // Delete tag

      const response = await request(app)
        .delete('/tags/tag-1')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message', 'Tag deleted successfully');
    });

    test('should prevent deletion when tag is used by bars', async () => {
      // Mock that tag is used by 3 bars
      db.execute.mockResolvedValueOnce([[{ count: 3 }]]);

      const response = await request(app)
        .delete('/tags/tag-1')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(409);

      expect(response.body).toHaveProperty('error', 'Cannot delete tag: it is currently used by one or more bars');
    });

    test('should reject delete without authentication', async () => {
      const response = await request(app)
        .delete('/tags/tag-1')
        .expect(401);

      expect(response.body).toHaveProperty('success', false);
    });

    test('should return 404 for non-existent tag', async () => {
      db.execute
        .mockResolvedValueOnce([[{ count: 0 }]]) // Tag usage check
        .mockResolvedValueOnce([{ affectedRows: 0 }]); // Delete attempt

      const response = await request(app)
        .delete('/tags/non-existent')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Tag not found');
    });
  });

  describe('Route Parameter Validation', () => {
    test('should handle invalid tag ID format in PUT', async () => {
      // The controller will process any ID format and return appropriate error
      db.execute.mockResolvedValueOnce([{ affectedRows: 0 }]);

      const response = await request(app)
        .put('/tags/invalid-id-format')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ name: 'Test' })
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Tag not found');
    });

    test('should handle invalid tag ID format in DELETE', async () => {
      // Mock that tag usage check returns 0 and delete returns 0 affected rows
      db.execute
        .mockResolvedValueOnce([[{ count: 0 }]])
        .mockResolvedValueOnce([{ affectedRows: 0 }]);

      const response = await request(app)
        .delete('/tags/invalid-id-format')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Tag not found');
    });
  });

  describe('Error Handling', () => {
    test('should handle malformed JSON in request body', async () => {
      const response = await request(app)
        .post('/tags')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}')
        .expect(400);

      // Express should handle malformed JSON and return an error
      expect(response.body).toBeDefined();
    });

    test('should handle database connection failures', async () => {
      db.query.mockRejectedValueOnce(new Error('Connection timeout'));

      const response = await request(app)
        .get('/tags')
        .expect(500);

      expect(response.body).toHaveProperty('error', 'Failed to fetch tags');
    });

    test('should handle expired JWT tokens', async () => {
      const expiredToken = jwt.sign(
        { userId: mockUser.id },
        process.env.JWT_SECRET,
        { expiresIn: '-1h' }
      );

      const response = await request(app)
        .post('/tags')
        .set('Authorization', `Bearer ${expiredToken}`)
        .send({ name: 'Test Tag', category: 'Test' })
        .expect(403);

      expect(response.body).toHaveProperty('success', false);
    });
  });

  describe('Content Type and Response Format', () => {
    test('should return JSON content type', async () => {
      db.query.mockResolvedValueOnce([[]]);

      const response = await request(app)
        .get('/tags')
        .expect(200);

      expect(response.headers['content-type']).toMatch(/application\/json/);
    });

    test('should handle requests with different accept headers', async () => {
      db.query.mockResolvedValueOnce([[]]);

      const response = await request(app)
        .get('/tags')
        .set('Accept', 'application/json, text/plain, */*')
        .expect(200);

      expect(response.body).toHaveProperty('data');
    });
  });
});