const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const db = require('../../src/utils/db');
const { createTestJWT, createMockUser } = require('../helpers/authHelpers');

// Mock the database module
jest.mock('../../src/utils/db');

describe('Bars Routes Integration Tests', () => {
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
    db.getConnection = jest.fn().mockResolvedValue(mockConnection);
  });

  describe('GET /bars - Public Route', () => {
    test('should allow access without authentication', async () => {
      const mockBars = [
        {
          id: 'bar-1',
          name: 'Test Bar',
          address: '123 Test St',
          is_active: 1
        }
      ];

      db.execute.mockResolvedValueOnce([mockBars]);

      const response = await request(app)
        .get('/bars')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    test('should work with optional authentication', async () => {
      const mockBars = [
        {
          id: 'bar-1',
          name: 'Test Bar',
          address: '123 Test St',
          is_active: 1
        }
      ];

      db.execute.mockResolvedValueOnce([mockBars]);

      const response = await request(app)
        .get('/bars')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
    });

    test('should handle database errors gracefully', async () => {
      db.execute.mockRejectedValueOnce(new Error('Database connection failed'));

      const response = await request(app)
        .get('/bars')
        .expect(500);

      expect(response.body).toHaveProperty('error', 'Failed to fetch bars');
    });
  });

  describe('GET /bars/search/name - Public Route', () => {
    test('should search for bars by name without authentication', async () => {
      const mockBars = [
        {
          id: 'bar-1',
          name: 'Irish Pub',
          address_street: '123 Test St',
          is_active: 1
        },
        {
          id: 'bar-2',
          name: 'The Irish Corner',
          address_street: '456 Another St',
          is_active: 1
        }
      ];

      db.execute.mockResolvedValueOnce([mockBars]);

      const response = await request(app)
        .get('/bars/search/name')
        .query({ q: 'irish' })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body.meta).toMatchObject({
        query: 'irish',
        count: 2,
        included: []
      });
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data).toHaveLength(2);
    });

    test('should search with include parameters', async () => {
      const mockBars = [
        {
          id: 'bar-1',
          name: 'Irish Pub',
          address_street: '123 Test St',
          is_active: 1,
          hours: '1:12:00:00:23:00:00:0',
          tags: 'tag-1:Irish Pub:type'
        }
      ];

      db.execute.mockResolvedValueOnce([mockBars]);

      const response = await request(app)
        .get('/bars/search/name')
        .query({ q: 'irish', include: 'hours,tags' })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.meta.included).toEqual(['hours', 'tags']);
      expect(response.body.data[0]).toHaveProperty('hours');
      expect(response.body.data[0]).toHaveProperty('tags');
    });

    test('should work with optional authentication', async () => {
      const mockBars = [
        {
          id: 'bar-1',
          name: 'Test Bar',
          address_street: '123 Test St',
          is_active: 1
        }
      ];

      db.execute.mockResolvedValueOnce([mockBars]);

      const response = await request(app)
        .get('/bars/search/name')
        .set('Authorization', `Bearer ${validToken}`)
        .query({ q: 'test' })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('meta');
    });

    test('should return 400 when query parameter is missing', async () => {
      const response = await request(app)
        .get('/bars/search/name')
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Search query parameter "q" is required');
    });

    test('should return 400 when query parameter is empty', async () => {
      const response = await request(app)
        .get('/bars/search/name')
        .query({ q: '' })
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Search query parameter "q" is required');
    });

    test('should return empty results when no bars match', async () => {
      db.execute.mockResolvedValueOnce([[]]);

      const response = await request(app)
        .get('/bars/search/name')
        .query({ q: 'nonexistent' })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data', []);
      expect(response.body.meta).toMatchObject({
        count: 0,
        query: 'nonexistent',
        included: []
      });
    });

    test('should handle database errors gracefully', async () => {
      db.execute.mockRejectedValueOnce(new Error('Database connection failed'));

      const response = await request(app)
        .get('/bars/search/name')
        .query({ q: 'test' })
        .expect(500);

      expect(response.body).toHaveProperty('error', 'Failed to search bars');
    });
  });

  describe('GET /bars/filter - Public Route', () => {
    test('should filter bars by tag without authentication', async () => {
      const mockBars = [
        {
          id: 'bar-1',
          name: 'Sports Bar',
          address_street: '123 Test St',
          address_city: 'Boston',
          is_active: 1
        }
      ];

      db.execute.mockResolvedValueOnce([mockBars]);

      const response = await request(app)
        .get('/bars/filter')
        .query({ tag: 'Sports Bar' })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('meta');
      expect(response.body.meta.filters).toMatchObject({ tag: 'Sports Bar' });
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    test('should filter bars by city', async () => {
      const mockBars = [
        {
          id: 'bar-1',
          name: 'Boston Bar',
          address_city: 'Boston',
          is_active: 1
        }
      ];

      db.execute.mockResolvedValueOnce([mockBars]);

      const response = await request(app)
        .get('/bars/filter')
        .query({ city: 'boston' })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.meta.filters).toMatchObject({ city: 'boston' });
    });

    test('should filter bars with upcoming events', async () => {
      const mockBars = [
        {
          id: 'bar-1',
          name: 'Event Bar',
          is_active: 1
        }
      ];

      db.execute.mockResolvedValueOnce([mockBars]);

      const response = await request(app)
        .get('/bars/filter')
        .query({ has_events: 'true' })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.meta.filters).toMatchObject({ has_events: 'true' });
    });

    test('should handle multiple filters with includes', async () => {
      const mockBars = [
        {
          id: 'bar-1',
          name: 'Test Bar',
          address_city: 'Boston',
          is_active: 1,
          hours: '1:12:00:00:23:00:00:0',
          tags: 'tag-1:Sports Bar:type'
        }
      ];

      db.execute.mockResolvedValueOnce([mockBars]);

      const response = await request(app)
        .get('/bars/filter')
        .query({ 
          city: 'boston', 
          tag: 'Sports Bar',
          include: 'hours,tags'
        })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.meta.filters).toMatchObject({ 
        city: 'boston', 
        tag: 'Sports Bar' 
      });
      expect(response.body.meta.included).toEqual(['hours', 'tags']);
      expect(response.body.data[0]).toHaveProperty('hours');
      expect(response.body.data[0]).toHaveProperty('tags');
    });

    test('should handle empty filter results', async () => {
      db.execute.mockResolvedValueOnce([[]]);

      const response = await request(app)
        .get('/bars/filter')
        .query({ tag: 'NonexistentTag' })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toEqual([]);
      expect(response.body.meta.count).toBe(0);
    });

    test('should handle database errors in filter', async () => {
      db.execute.mockRejectedValueOnce(new Error('Database connection failed'));

      const response = await request(app)
        .get('/bars/filter')
        .query({ city: 'boston' })
        .expect(500);

      expect(response.body).toHaveProperty('error', 'Failed to filter bars');
    });
  });

  describe('GET /bars/:id - Public Route', () => {
    test('should get single bar without authentication', async () => {
      const mockBar = {
        id: 'bar-1',
        name: 'Test Bar',
        address: '123 Test St',
        is_active: 1,
        hours: null,
        tags: null
      };

      db.execute.mockResolvedValueOnce([[mockBar]]);

      const response = await request(app)
        .get('/bars/bar-1')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toMatchObject({
        id: 'bar-1',
        name: 'Test Bar',
        address: '123 Test St',
        is_active: 1,
        hours: [],
        tags: []
      });
    });

    test('should support include parameters', async () => {
      const mockBar = {
        id: 'bar-1',
        name: 'Test Bar',
        is_active: 1,
        hours: '1:12:00:00:23:00:00:0,2:12:00:00:23:00:00:0',
        tags: 'tag-1:Sports Bar:type,tag-2:Pool Tables:amenity'
      };

      db.execute.mockResolvedValueOnce([[mockBar]]);

      const response = await request(app)
        .get('/bars/bar-1')
        .query({ include: 'hours,tags' })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data.hours).toHaveLength(2);
      expect(response.body.data.tags).toHaveLength(2);
      expect(response.body.meta.included).toEqual(['hours', 'tags']);
    });

    test('should return 404 for non-existent bar', async () => {
      db.execute.mockResolvedValueOnce([[]]);

      const response = await request(app)
        .get('/bars/non-existent')
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Bar not found');
    });
  });

  describe('POST /bars - Protected Route', () => {
    test('should create bar with valid authentication', async () => {
      const newBar = {
        name: 'New Test Bar',
        address_street: '456 New St',
        address_city: 'Test City',
        address_state: 'TS',
        address_zip: '12345',
        phone: '555-0123',
        website: 'https://newtestbar.com',
        hours: [
          { day_of_week: 1, open_time: '12:00', close_time: '24:00', is_closed: false },
          { day_of_week: 2, open_time: '12:00', close_time: '24:00', is_closed: false }
        ],
        tag_ids: ['tag-1', 'tag-2']
      };

      const mockBarId = 'new-bar-123';
      
      // Mock successful bar creation
      mockConnection.execute
        .mockResolvedValueOnce([]) // Insert bar
        .mockResolvedValueOnce([]) // Insert hours (first hour)
        .mockResolvedValueOnce([]) // Insert hours (second hour)
        .mockResolvedValueOnce([]) // Insert tags (first tag)
        .mockResolvedValueOnce([]); // Insert tags (second tag)

      mockConnection.commit.mockResolvedValueOnce();

      const response = await request(app)
        .post('/bars')
        .set('Authorization', `Bearer ${validToken}`)
        .send(newBar)
        .expect(201);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('id');
    });

    test('should reject request without authentication', async () => {
      const newBar = {
        name: 'New Test Bar',
        address: '456 New St'
      };

      const response = await request(app)
        .post('/bars')
        .send(newBar)
        .expect(401);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message', 'Access denied. No token provided or invalid format. Expected: Bearer <token>');
    });

    test('should reject request with invalid token', async () => {
      const newBar = {
        name: 'New Test Bar',
        address: '456 New St'
      };

      const response = await request(app)
        .post('/bars')
        .set('Authorization', 'Bearer invalid-token')
        .send(newBar)
        .expect(403);

      expect(response.body).toHaveProperty('success', false);
    });

    test('should validate required fields', async () => {
      const incompleteBar = {
        name: 'Test Bar'
        // Missing required address fields
      };

      const response = await request(app)
        .post('/bars')
        .set('Authorization', `Bearer ${validToken}`)
        .send(incompleteBar)
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Missing required bar fields');
    });
  });

  describe('PUT /bars/:id - Protected Route', () => {
    test('should update bar with valid authentication', async () => {
      const updateData = {
        name: 'Updated Bar Name',
        address_street: '789 Updated St',
        phone: '555-9876'
      };

      // Mock check if bar exists
      db.execute.mockResolvedValueOnce([[{ id: 'bar-1' }]]);
      
      // Mock successful update operations
      mockConnection.execute.mockResolvedValue([]);
      mockConnection.commit.mockResolvedValue();

      const response = await request(app)
        .put('/bars/bar-1')
        .set('Authorization', `Bearer ${validToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message', 'Bar updated successfully');
      expect(response.body.data).toHaveProperty('id', 'bar-1');
    });

    test('should reject update without authentication', async () => {
      const updateData = {
        name: 'Updated Bar Name'
      };

      const response = await request(app)
        .put('/bars/bar-1')
        .send(updateData)
        .expect(401);

      expect(response.body).toHaveProperty('success', false);
    });

    test('should return 404 for non-existent bar', async () => {
      const updateData = {
        name: 'Updated Bar Name'
      };

      // Mock that bar doesn't exist
      db.execute.mockResolvedValueOnce([[]]);

      const response = await request(app)
        .put('/bars/non-existent')
        .set('Authorization', `Bearer ${validToken}`)
        .send(updateData)
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Bar not found');
    });
  });

  describe('DELETE /bars/:id - Protected Route', () => {
    test('should soft delete bar with valid authentication', async () => {
      db.execute.mockResolvedValueOnce([{ affectedRows: 1 }]);

      const response = await request(app)
        .delete('/bars/bar-1')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message', 'Bar deleted successfully');
    });

    test('should reject delete without authentication', async () => {
      const response = await request(app)
        .delete('/bars/bar-1')
        .expect(401);

      expect(response.body).toHaveProperty('success', false);
    });

    test('should return 404 for non-existent bar', async () => {
      db.execute.mockResolvedValueOnce([{ affectedRows: 0 }]);

      const response = await request(app)
        .delete('/bars/non-existent')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Bar not found');
    });
  });

  describe('Route Error Handling', () => {
    test('should handle malformed JSON in request body', async () => {
      const response = await request(app)
        .post('/bars')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}')
        .expect(400);

      // Express should handle malformed JSON and return an error
      expect(response.body).toBeDefined();
    });

    test('should handle database connection failures', async () => {
      db.execute.mockRejectedValueOnce(new Error('Connection pool exhausted'));

      const response = await request(app)
        .get('/bars')
        .expect(500);

      expect(response.body).toHaveProperty('error', 'Failed to fetch bars');
    });

    test('should handle expired JWT tokens', async () => {
      const expiredToken = jwt.sign(
        { userId: mockUser.id },
        process.env.JWT_SECRET,
        { expiresIn: '-1h' } // Already expired
      );

      const response = await request(app)
        .post('/bars')
        .set('Authorization', `Bearer ${expiredToken}`)
        .send({ name: 'Test Bar', address_street: '123 Test St', address_city: 'Test', address_state: 'TS', address_zip: '12345' })
        .expect(403);

      expect(response.body).toHaveProperty('success', false);
    });
  });

  describe('CORS and Headers', () => {
    test('should handle preflight OPTIONS request', async () => {
      const response = await request(app)
        .options('/bars');

      // OPTIONS should return some response (status varies by Express/CORS setup)
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(300);
    });

    test('should set proper content-type for JSON responses', async () => {
      db.execute.mockResolvedValueOnce([[]]);

      const response = await request(app)
        .get('/bars')
        .expect(200);

      expect(response.headers['content-type']).toMatch(/application\/json/);
    });
  });
});