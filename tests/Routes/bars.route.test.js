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