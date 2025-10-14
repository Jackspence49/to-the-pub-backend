const request = require('supertest');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const app = require('../../src/app');
const db = require('../../src/utils/db');
const { createTestJWT, createMockUser } = require('../helpers/authHelpers');

// Mock the database module
jest.mock('../../src/utils/db');

describe('Bars Controller Tests', () => {
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

  describe('GET /bars - Get All Bars', () => {
    test('should successfully return all bars', async () => {
      const mockBars = [
        {
          id: 'bar-1',
          name: 'Test Bar 1',
          description: 'A great test bar',
          address_street: '123 Test St',
          address_city: 'Test City',
          address_state: 'TX',
          address_zip: '12345',
          latitude: 30.2672,
          longitude: -97.7431,
          phone: '555-0123',
          website: 'https://testbar1.com',
          instagram: '@testbar1',
          facebook: 'testbar1',
          is_active: 1,
          hours: '0:09:00:00:17:00:00:0,1:09:00:00:17:00:00:0',
          tags: 'Sports Bar,Craft Beer'
        }
      ];

      db.execute.mockResolvedValue([mockBars]);

      const response = await request(app)
        .get('/bars')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].name).toBe('Test Bar 1');
      expect(response.body.data[0].hours).toHaveLength(2);
      expect(response.body.data[0].tags).toEqual(['Sports Bar', 'Craft Beer']);
    });

    test('should return empty array when no bars exist', async () => {
      db.execute.mockResolvedValue([[]]);

      const response = await request(app)
        .get('/bars')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(0);
    });

    test('should handle database errors gracefully', async () => {
      db.execute.mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app)
        .get('/bars')
        .expect(500);

      expect(response.body.error).toBe('Failed to fetch bars');
    });
  });

  describe('GET /bars/:id - Get Single Bar', () => {
    test('should successfully return a single bar', async () => {
      const mockBar = [
        {
          id: 'bar-1',
          name: 'Test Bar 1',
          description: 'A great test bar',
          address_street: '123 Test St',
          address_city: 'Test City',
          address_state: 'TX',
          address_zip: '12345',
          latitude: 30.2672,
          longitude: -97.7431,
          phone: '555-0123',
          website: 'https://testbar1.com',
          instagram: '@testbar1',
          facebook: 'testbar1',
          is_active: 1,
          hours: '0:09:00:00:17:00:00:0,1:09:00:00:17:00:00:0',
          tags: 'Sports Bar,Craft Beer'
        }
      ];

      db.execute.mockResolvedValue([mockBar]);

      const response = await request(app)
        .get('/bars/bar-1')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('Test Bar 1');
      expect(response.body.data.hours).toHaveLength(2);
      expect(response.body.data.tags).toEqual(['Sports Bar', 'Craft Beer']);
    });

    test('should return 404 when bar is not found', async () => {
      db.execute.mockResolvedValue([[]]);

      const response = await request(app)
        .get('/bars/nonexistent-bar')
        .expect(404);

      expect(response.body.error).toBe('Bar not found');
    });

    test('should handle database errors gracefully', async () => {
      db.execute.mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app)
        .get('/bars/bar-1')
        .expect(500);

      expect(response.body.error).toBe('Failed to fetch bar');
    });
  });

  describe('POST /bars - Create Bar', () => {
    const validBarData = {
      name: 'New Test Bar',
      description: 'A new bar for testing',
      address_street: '456 New St',
      address_city: 'New City',
      address_state: 'CA',
      address_zip: '54321',
      latitude: 34.0522,
      longitude: -118.2437,
      phone: '555-0456',
      website: 'https://newtestbar.com',
      instagram: '@newtestbar',
      facebook: 'newtestbar',
      hours: [
        {
          day_of_week: 0,
          open_time: '10:00:00',
          close_time: '22:00:00',
          is_closed: false
        },
        {
          day_of_week: 1,
          open_time: '10:00:00',
          close_time: '22:00:00',
          is_closed: false
        }
      ],
      tag_ids: ['tag-1', 'tag-2']
    };

    test('should successfully create a bar with authentication', async () => {
      mockConnection.execute.mockResolvedValue([{ insertId: 1 }]);

      const response = await request(app)
        .post('/bars')
        .set('Authorization', `Bearer ${validToken}`)
        .send(validBarData)
        .expect(201);

      expect(response.body.data).toHaveProperty('id');
      expect(mockConnection.beginTransaction).toHaveBeenCalled();
      expect(mockConnection.commit).toHaveBeenCalled();
      expect(mockConnection.release).toHaveBeenCalled();
    });

    test('should require authentication', async () => {
      const response = await request(app)
        .post('/bars')
        .send(validBarData)
        .expect(401);

      expect(response.body.message).toBe('Access denied. No token provided or invalid format. Expected: Bearer <token>');
    });

    test('should validate required fields', async () => {
      const invalidData = { name: 'Test Bar' }; // Missing required fields

      const response = await request(app)
        .post('/bars')
        .set('Authorization', `Bearer ${validToken}`)
        .send(invalidData)
        .expect(400);

      expect(response.body.error).toBe('Missing required bar fields');
    });

    test('should handle database transaction errors', async () => {
      mockConnection.execute.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/bars')
        .set('Authorization', `Bearer ${validToken}`)
        .send(validBarData)
        .expect(500);

      expect(response.body.error).toBe('Failed to create bar');
      expect(mockConnection.rollback).toHaveBeenCalled();
      expect(mockConnection.release).toHaveBeenCalled();
    });

    test('should create bar without optional fields', async () => {
      const minimalBarData = {
        name: 'Minimal Bar',
        address_street: '123 Main St',
        address_city: 'Test City',
        address_state: 'TX',
        address_zip: '12345'
      };

      mockConnection.execute.mockResolvedValue([{ insertId: 1 }]);

      const response = await request(app)
        .post('/bars')
        .set('Authorization', `Bearer ${validToken}`)
        .send(minimalBarData)
        .expect(201);

      expect(response.body.data).toHaveProperty('id');
    });
  });

  describe('PUT /bars/:id - Update Bar', () => {
    const updateData = {
      name: 'Updated Bar Name',
      description: 'Updated description',
      phone: '555-9999'
    };

    test('should successfully update a bar with authentication', async () => {
      // Mock bar exists check
      db.execute.mockResolvedValue([[{ id: 'bar-1' }]]);
      mockConnection.execute.mockResolvedValue([{ affectedRows: 1 }]);

      const response = await request(app)
        .put('/bars/bar-1')
        .set('Authorization', `Bearer ${validToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Bar updated successfully');
      expect(response.body.data.id).toBe('bar-1');
      expect(mockConnection.beginTransaction).toHaveBeenCalled();
      expect(mockConnection.commit).toHaveBeenCalled();
    });

    test('should require authentication', async () => {
      const response = await request(app)
        .put('/bars/bar-1')
        .send(updateData)
        .expect(401);

      expect(response.body.message).toBe('Access denied. No token provided or invalid format. Expected: Bearer <token>');
    });

    test('should return 404 when bar is not found', async () => {
      db.execute.mockResolvedValue([[]]);

      const response = await request(app)
        .put('/bars/nonexistent-bar')
        .set('Authorization', `Bearer ${validToken}`)
        .send(updateData)
        .expect(404);

      expect(response.body.error).toBe('Bar not found');
    });

    test('should update bar hours when provided', async () => {
      const updateWithHours = {
        ...updateData,
        hours: [
          {
            day_of_week: 0,
            open_time: '11:00:00',
            close_time: '23:00:00',
            is_closed: false
          }
        ]
      };

      db.execute.mockResolvedValue([[{ id: 'bar-1' }]]);
      mockConnection.execute.mockResolvedValue([{ affectedRows: 1 }]);

      const response = await request(app)
        .put('/bars/bar-1')
        .set('Authorization', `Bearer ${validToken}`)
        .send(updateWithHours)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    test('should handle database errors during update', async () => {
      db.execute.mockResolvedValue([[{ id: 'bar-1' }]]);
      mockConnection.execute.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .put('/bars/bar-1')
        .set('Authorization', `Bearer ${validToken}`)
        .send(updateData)
        .expect(500);

      expect(response.body.error).toBe('Failed to update bar');
      expect(mockConnection.rollback).toHaveBeenCalled();
    });
  });

  describe('DELETE /bars/:id - Delete Bar', () => {
    test('should successfully soft delete a bar with authentication', async () => {
      db.execute.mockResolvedValue([{ affectedRows: 1 }]);

      const response = await request(app)
        .delete('/bars/bar-1')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Bar deleted successfully');
      expect(response.body.data.id).toBe('bar-1');
    });

    test('should require authentication', async () => {
      const response = await request(app)
        .delete('/bars/bar-1')
        .expect(401);

      expect(response.body.message).toBe('Access denied. No token provided or invalid format. Expected: Bearer <token>');
    });

    test('should return 404 when bar is not found', async () => {
      db.execute.mockResolvedValue([{ affectedRows: 0 }]);

      const response = await request(app)
        .delete('/bars/nonexistent-bar')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(404);

      expect(response.body.error).toBe('Bar not found');
    });

    test('should handle database errors during deletion', async () => {
      db.execute.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .delete('/bars/bar-1')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(500);

      expect(response.body.error).toBe('Failed to delete bar');
    });
  });

  describe('Authentication and Authorization', () => {
    test('should reject invalid JWT tokens', async () => {
      const invalidToken = 'invalid.jwt.token';

      const response = await request(app)
        .post('/bars')
        .set('Authorization', `Bearer ${invalidToken}`)
        .send({
          name: 'Test Bar',
          address_street: '123 Main St',
          address_city: 'Test City',
          address_state: 'TX',
          address_zip: '12345'
        })
        .expect(403);

      expect(response.body.message).toBe('Invalid token. Access forbidden.');
    });

    test('should reject malformed Authorization headers', async () => {
      const response = await request(app)
        .post('/bars')
        .set('Authorization', 'InvalidFormat')
        .send({
          name: 'Test Bar',
          address_street: '123 Main St',
          address_city: 'Test City',
          address_state: 'TX',
          address_zip: '12345'
        })
        .expect(401);

      expect(response.body.message).toBe('Access denied. No token provided or invalid format. Expected: Bearer <token>');
    });
  });

  describe('Data Validation and Edge Cases', () => {
    test('should handle empty request body gracefully', async () => {
      const response = await request(app)
        .post('/bars')
        .set('Authorization', `Bearer ${validToken}`)
        .send({})
        .expect(400);

      expect(response.body.error).toBe('Missing required bar fields');
    });

    test('should handle null values in optional fields', async () => {
      const barDataWithNulls = {
        name: 'Test Bar',
        address_street: '123 Main St',
        address_city: 'Test City',
        address_state: 'TX',
        address_zip: '12345',
        description: null,
        latitude: null,
        longitude: null,
        phone: null,
        website: null,
        instagram: null,
        facebook: null
      };

      mockConnection.execute.mockResolvedValue([{ insertId: 1 }]);

      const response = await request(app)
        .post('/bars')
        .set('Authorization', `Bearer ${validToken}`)
        .send(barDataWithNulls)
        .expect(201);

      expect(response.body.data).toHaveProperty('id');
    });

    test('should handle empty arrays for hours and tag_ids', async () => {
      const barDataWithEmptyArrays = {
        name: 'Test Bar',
        address_street: '123 Main St',
        address_city: 'Test City',
        address_state: 'TX',
        address_zip: '12345',
        hours: [],
        tag_ids: []
      };

      mockConnection.execute.mockResolvedValue([{ insertId: 1 }]);

      const response = await request(app)
        .post('/bars')
        .set('Authorization', `Bearer ${validToken}`)
        .send(barDataWithEmptyArrays)
        .expect(201);

      expect(response.body.data).toHaveProperty('id');
    });
  });
});