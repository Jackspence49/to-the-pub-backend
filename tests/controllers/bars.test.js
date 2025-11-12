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
    db.query = jest.fn();
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

      // Mock both count query and main query for pagination
      db.query
        .mockResolvedValueOnce([[{ total: 1 }], []]) // Count query
        .mockResolvedValueOnce([mockBars, []]); // Main query

      const response = await request(app)
        .get('/bars?include=hours,tags')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].name).toBe('Test Bar 1');
      expect(response.body.data[0].hours).toHaveLength(2);
      expect(response.body.data[0].tags).toEqual([
        { id: 'Sports Bar', name: undefined, category: null },
        { id: 'Craft Beer', name: undefined, category: null }
      ]);
    });

    test('should return empty array when no bars exist', async () => {
      // Mock both count query and main query for pagination
      db.query
        .mockResolvedValueOnce([[{ total: 0 }], []]) // Count query
        .mockResolvedValueOnce([[], []]); // Main query

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

  describe('GET /bars - Geolocation Features', () => {
    test('should return bars within specified radius with distance data', async () => {
      const mockBars = [
        {
          id: 'bar-1',
          name: 'Nearby Bar',
          address_street: '123 Test St',
          address_city: 'Test City',
          address_state: 'TX',
          address_zip: '12345',
          latitude: 42.3601,
          longitude: -71.0589,
          distance: 2.5,
          distanceUnit: 'miles'
        }
      ];

      db.execute.mockResolvedValue([mockBars]);

      const response = await request(app)
        .get('/bars?lat=42.3601&lon=-71.0589&radius=5&unit=miles')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].distance).toBe(2.5);
      expect(response.body.data[0].distanceUnit).toBe('miles');
      expect(response.body.meta.filters.lat).toBe('42.3601');
      expect(response.body.meta.filters.lon).toBe('-71.0589');
      expect(response.body.meta.filters.radius).toBe('5');
      expect(response.body.meta.filters.unit).toBe('miles');
    });

    test('should validate that lat and lon are provided together', async () => {
      const response = await request(app)
        .get('/bars?lat=42.3601')
        .expect(400);

      expect(response.body.error).toBe('Both lat and lon parameters must be provided together');
    });

    test('should validate latitude range', async () => {
      const response = await request(app)
        .get('/bars?lat=95&lon=-71.0589')
        .expect(400);

      expect(response.body.error).toBe('Latitude must be a number between -90 and 90');
    });

    test('should validate longitude range', async () => {
      const response = await request(app)
        .get('/bars?lat=42.3601&lon=185')
        .expect(400);

      expect(response.body.error).toBe('Longitude must be a number between -180 and 180');
    });

    test('should validate radius range', async () => {
      const response = await request(app)
        .get('/bars?lat=42.3601&lon=-71.0589&radius=55')
        .expect(400);

      expect(response.body.error).toBe('Radius must be a number between 0 and 50');
    });

    test('should validate unit parameter', async () => {
      const response = await request(app)
        .get('/bars?lat=42.3601&lon=-71.0589&unit=feet')
        .expect(400);

      expect(response.body.error).toBe('Unit must be either "miles" or "km"');
    });

    test('should use default radius and unit when not specified', async () => {
      const mockBars = [
        {
          id: 'bar-1',
          name: 'Nearby Bar',
          latitude: 42.3601,
          longitude: -71.0589,
          distance: 3.2,
          distanceUnit: 'miles'
        }
      ];

      db.execute.mockResolvedValue([mockBars]);

      const response = await request(app)
        .get('/bars?lat=42.3601&lon=-71.0589')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.meta.filters.radius).toBe('5');
      expect(response.body.meta.filters.unit).toBe('miles');
    });

    test('should work with kilometers unit', async () => {
      const mockBars = [
        {
          id: 'bar-1',
          name: 'Nearby Bar',
          latitude: 42.3601,
          longitude: -71.0589,
          distance: 4.8,
          distanceUnit: 'km'
        }
      ];

      db.execute.mockResolvedValue([mockBars]);

      const response = await request(app)
        .get('/bars?lat=42.3601&lon=-71.0589&radius=10&unit=km')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data[0].distance).toBe(4.8);
      expect(response.body.data[0].distanceUnit).toBe('km');
    });

    test('should return bars sorted by distance when lat and lon parameters are provided', async () => {
      const mockBars = [
        {
          id: 'bar-1',
          name: 'Far Bar',
          address_street: '123 Test St',
          address_city: 'Test City',
          address_state: 'TX',
          address_zip: '12345',
          latitude: 40.7580,
          longitude: -73.9855,
          distance_km: 5.67
        },
        {
          id: 'bar-2',
          name: 'Near Bar',
          address_street: '456 Test Ave',
          address_city: 'Test City',
          address_state: 'TX',
          address_zip: '12346',
          latitude: 40.7589,
          longitude: -73.9851,
          distance_km: 1.23
        }
      ];

      db.query.mockResolvedValue([mockBars]);

      const response = await request(app)
        .get('/bars?lat=40.7589&lon=-73.9851')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0].name).toBe('Far Bar');
      expect(response.body.data[1].name).toBe('Near Bar');
      expect(response.body.meta.location).toEqual({
        lat: 40.7589,
        lon: -73.9851,
        sorted_by_distance: true,
        unit: 'km'
      });
    });

    test('should filter bars by radius when radius parameter is provided', async () => {
      const mockBars = [
        {
          id: 'bar-1',
          name: 'Nearby Bar',
          address_street: '123 Test St',
          address_city: 'Test City',
          address_state: 'TX',
          address_zip: '12345',
          latitude: 40.7580,
          longitude: -73.9855,
          distance_km: 2.5
        }
      ];

      db.query.mockResolvedValue([mockBars]);

      const response = await request(app)
        .get('/bars?lat=40.7589&lon=-73.9851&radius=5')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].name).toBe('Nearby Bar');
      expect(response.body.meta.filters.radius).toBe(5);
      expect(response.body.meta.filters.unit).toBe('km');
    });

    test('should support miles unit for distance calculation', async () => {
      const mockBars = [
        {
          id: 'bar-1',
          name: 'Bar in Miles',
          address_street: '123 Test St',
          address_city: 'Test City',
          address_state: 'TX',
          address_zip: '12345',
          latitude: 40.7580,
          longitude: -73.9855,
          distance_miles: 1.55
        }
      ];

      db.query.mockResolvedValue([mockBars]);

      const response = await request(app)
        .get('/bars?lat=40.7589&lon=-73.9851&unit=miles')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].name).toBe('Bar in Miles');
      expect(response.body.meta.location.unit).toBe('miles');
      expect(response.body.meta.filters.unit).toBe('miles');
    });

    test('should support radius with miles unit', async () => {
      const mockBars = [
        {
          id: 'bar-1',
          name: 'Bar within 3 miles',
          address_street: '123 Test St',
          address_city: 'Test City',
          address_state: 'TX',
          address_zip: '12345',
          latitude: 40.7580,
          longitude: -73.9855,
          distance_miles: 2.1
        }
      ];

      db.query.mockResolvedValue([mockBars]);

      const response = await request(app)
        .get('/bars?lat=40.7589&lon=-73.9851&radius=3&unit=miles')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].name).toBe('Bar within 3 miles');
      expect(response.body.meta.filters.radius).toBe(3);
      expect(response.body.meta.filters.unit).toBe('miles');
    });

    test('should validate lat/lon parameters', async () => {
      const response1 = await request(app)
        .get('/bars?lat=invalid&lon=-73.9851')
        .expect(400);
      
      expect(response1.body.error).toContain('Invalid latitude or longitude');

      const response2 = await request(app)
        .get('/bars?lat=91&lon=-73.9851')
        .expect(400);
      
      expect(response2.body.error).toContain('Invalid latitude or longitude');

      const response3 = await request(app)
        .get('/bars?lat=40.7589&lon=181')
        .expect(400);
      
      expect(response3.body.error).toContain('Invalid latitude or longitude');
    });

    test('should validate radius parameter', async () => {
      const response1 = await request(app)
        .get('/bars?lat=40.7589&lon=-73.9851&radius=-5')
        .expect(400);
      
      expect(response1.body.error).toContain('Radius must be a positive number');

      const response2 = await request(app)
        .get('/bars?lat=40.7589&lon=-73.9851&radius=invalid')
        .expect(400);
      
      expect(response2.body.error).toContain('Radius must be a positive number');

      const response3 = await request(app)
        .get('/bars?radius=5')
        .expect(400);
      
      expect(response3.body.error).toContain('Radius and unit parameters require both lat and lon');
    });

    test('should validate unit parameter', async () => {
      const response1 = await request(app)
        .get('/bars?lat=40.7589&lon=-73.9851&unit=invalid')
        .expect(400);
      
      expect(response1.body.error).toContain('Unit must be either "km" or "miles"');

      const response2 = await request(app)
        .get('/bars?unit=miles')
        .expect(400);
      
      expect(response2.body.error).toContain('Radius and unit parameters require both lat and lon');
    });
  });

  describe('GET /bars - Pagination Features', () => {
    test('should support pagination with page and limit parameters', async () => {
      const mockBars = [
        { id: 'bar-1', name: 'Bar 1', address_street: '123 Test St' },
        { id: 'bar-2', name: 'Bar 2', address_street: '456 Test Ave' }
      ];
      
      const mockCount = [{ total: 25 }];

      db.query
        .mockResolvedValueOnce([mockCount])  // Count query
        .mockResolvedValueOnce([mockBars]);  // Data query

      const response = await request(app)
        .get('/bars?page=2&limit=10')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.meta.page).toBe(2);
      expect(response.body.meta.limit).toBe(10);
      expect(response.body.meta.total).toBe(25);
      expect(response.body.meta.totalPages).toBe(3);
      expect(response.body.meta.hasNextPage).toBe(true);
      expect(response.body.meta.hasPrevPage).toBe(true);
    });

    test('should use default pagination values when not provided', async () => {
      const mockBars = [{ id: 'bar-1', name: 'Bar 1' }];
      const mockCount = [{ total: 1 }];

      db.query
        .mockResolvedValueOnce([mockCount])
        .mockResolvedValueOnce([mockBars]);

      const response = await request(app)
        .get('/bars')
        .expect(200);

      expect(response.body.meta.page).toBe(1);
      expect(response.body.meta.limit).toBe(50);
      expect(response.body.meta.totalPages).toBe(1);
      expect(response.body.meta.hasNextPage).toBe(false);
      expect(response.body.meta.hasPrevPage).toBe(false);
    });

    test('should validate page parameter', async () => {
      const response1 = await request(app)
        .get('/bars?page=0')
        .expect(400);
      
      expect(response1.body.error).toContain('Page must be a positive integer starting from 1');

      const response2 = await request(app)
        .get('/bars?page=invalid')
        .expect(400);
      
      expect(response2.body.error).toContain('Page must be a positive integer starting from 1');
    });

    test('should validate limit parameter', async () => {
      const response1 = await request(app)
        .get('/bars?limit=0')
        .expect(400);
      
      expect(response1.body.error).toContain('Limit must be between 1 and 100');

      const response2 = await request(app)
        .get('/bars?limit=101')
        .expect(400);
      
      expect(response2.body.error).toContain('Limit must be between 1 and 100');

      const response3 = await request(app)
        .get('/bars?limit=invalid')
        .expect(400);
      
      expect(response3.body.error).toContain('Limit must be between 1 and 100');
    });

    test('should work with pagination and distance sorting combined', async () => {
      const mockBars = [
        {
          id: 'bar-1',
          name: 'Nearby Bar',
          latitude: 40.7580,
          longitude: -73.9855,
          distance_km: 1.5
        }
      ];
      
      const mockCount = [{ total: 15 }];

      db.query
        .mockResolvedValueOnce([mockCount])
        .mockResolvedValueOnce([mockBars]);

      const response = await request(app)
        .get('/bars?lat=40.7589&lon=-73.9851&page=1&limit=5')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.meta.page).toBe(1);
      expect(response.body.meta.limit).toBe(5);
      expect(response.body.meta.total).toBe(15);
      expect(response.body.meta.totalPages).toBe(3);
      expect(response.body.meta.location.sorted_by_distance).toBe(true);
    });

    test('should work with pagination and radius filtering combined', async () => {
      const mockBars = [
        {
          id: 'bar-1',
          name: 'Filtered Bar',
          latitude: 40.7580,
          longitude: -73.9855,
          distance_miles: 2.1
        }
      ];
      
      const mockCount = [{ total: 8 }];

      db.query
        .mockResolvedValueOnce([mockCount])
        .mockResolvedValueOnce([mockBars]);

      const response = await request(app)
        .get('/bars?lat=40.7589&lon=-73.9851&radius=3&unit=miles&page=2&limit=3')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.meta.page).toBe(2);
      expect(response.body.meta.limit).toBe(3);
      expect(response.body.meta.total).toBe(8);
      expect(response.body.meta.totalPages).toBe(3);
      expect(response.body.meta.filters.radius).toBe(3);
      expect(response.body.meta.filters.unit).toBe('miles');
    });

    test('should handle last page correctly', async () => {
      const mockBars = [
        { id: 'bar-1', name: 'Last Bar' }
      ];
      
      const mockCount = [{ total: 21 }];

      db.query
        .mockResolvedValueOnce([mockCount])
        .mockResolvedValueOnce([mockBars]);

      const response = await request(app)
        .get('/bars?page=3&limit=10')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.meta.page).toBe(3);
      expect(response.body.meta.limit).toBe(10);
      expect(response.body.meta.total).toBe(21);
      expect(response.body.meta.totalPages).toBe(3);
      expect(response.body.meta.hasNextPage).toBe(false);
      expect(response.body.meta.hasPrevPage).toBe(true);
      expect(response.body.meta.count).toBe(1); // Only 1 item on last page
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
      mockConnection.execute.mockResolvedValue([{ insertId: 1 }, []]);

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

    test('should prevent creating duplicate bars with same name and address', async () => {
      // Mock the duplicate check to return an existing bar
      const duplicateCheckResult = [{ id: 'existing-bar-id' }];
      mockConnection.execute.mockResolvedValueOnce([duplicateCheckResult, []]);

      const response = await request(app)
        .post('/bars')
        .set('Authorization', `Bearer ${validToken}`)
        .send(validBarData)
        .expect(409);

      expect(response.body.error).toBe('A bar with this name and address already exists');
      expect(mockConnection.beginTransaction).toHaveBeenCalled();
      expect(mockConnection.rollback).toHaveBeenCalled();
      expect(mockConnection.release).toHaveBeenCalled();
      
      // Verify the duplicate check SQL was called with correct parameters
      expect(mockConnection.execute).toHaveBeenCalledWith(
        expect.stringContaining('SELECT id FROM bars'),
        [
          validBarData.name,
          validBarData.address_street,
          validBarData.address_city,
          validBarData.address_state,
          validBarData.address_zip
        ]
      );
    });

    test('should allow creating bar when no duplicate exists', async () => {
      // Mock the duplicate check to return no results (no duplicate)
      mockConnection.execute.mockResolvedValueOnce([[]]);
      // Mock the successful bar insertion
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
      
      // Verify duplicate check was performed first
      expect(mockConnection.execute).toHaveBeenNthCalledWith(1,
        expect.stringContaining('SELECT id FROM bars'),
        [
          validBarData.name,
          validBarData.address_street,
          validBarData.address_city,
          validBarData.address_state,
          validBarData.address_zip
        ]
      );
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
      expect(response.body.message).toBe('Bar information updated successfully');
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

    test('should reject requests that include hours or tag_ids', async () => {
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

      const response = await request(app)
        .put('/bars/bar-1')
        .set('Authorization', `Bearer ${validToken}`)
        .send(updateWithHours)
        .expect(400);

      expect(response.body.error).toBe('This endpoint only updates basic bar information. Hours and tags cannot be updated through this endpoint.');
    });

    test('should reject requests that include tag_ids', async () => {
      const updateWithTags = {
        ...updateData,
        tag_ids: ['tag-1', 'tag-2']
      };

      const response = await request(app)
        .put('/bars/bar-1')
        .set('Authorization', `Bearer ${validToken}`)
        .send(updateWithTags)
        .expect(400);

      expect(response.body.error).toBe('This endpoint only updates basic bar information. Hours and tags cannot be updated through this endpoint.');
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

    test('should prevent updating to duplicate bar information', async () => {
      // Mock bar exists check
      db.execute.mockResolvedValue([[{ id: 'bar-1' }]]);
      
      // Mock duplicate found in update check
      mockConnection.execute.mockResolvedValueOnce([
        [{ id: 'existing-bar-id' }] // Duplicate found
      ]);

      const duplicateUpdateData = {
        name: 'Existing Bar',
        address_street: '123 Existing St',
        address_city: 'Existing City',
        address_state: 'TX',
        address_zip: '12345'
      };

      const response = await request(app)
        .put('/bars/bar-1')
        .set('Authorization', `Bearer ${validToken}`)
        .send(duplicateUpdateData)
        .expect(409);

      expect(response.body.error).toBe('A bar with this name and address already exists');
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

  describe('POST /bars/:barId/tags/:tagId - Add Tag to Bar', () => {
    test('should successfully add a tag to a bar with authentication', async () => {
      // Mock bar exists check
      db.execute.mockResolvedValueOnce([[{ id: 'bar-1' }]]);
      // Mock tag exists check
      db.execute.mockResolvedValueOnce([[{ id: 'tag-1' }]]);
      // Mock relationship doesn't exist check
      db.execute.mockResolvedValueOnce([[]]);
      // Mock successful insert
      db.execute.mockResolvedValueOnce([{ affectedRows: 1 }]);

      const response = await request(app)
        .post('/bars/bar-1/tags/tag-1')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Tag added to bar successfully');
      expect(response.body.data.bar_id).toBe('bar-1');
      expect(response.body.data.tag_id).toBe('tag-1');
    });

    test('should require authentication', async () => {
      const response = await request(app)
        .post('/bars/bar-1/tags/tag-1')
        .expect(401);

      expect(response.body.message).toBe('Access denied. No token provided or invalid format. Expected: Bearer <token>');
    });

    test('should return 404 when bar is not found', async () => {
      // Mock bar doesn't exist
      db.execute.mockResolvedValueOnce([[]]);

      const response = await request(app)
        .post('/bars/nonexistent-bar/tags/tag-1')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(404);

      expect(response.body.error).toBe('Bar not found');
    });

    test('should return 404 when tag is not found', async () => {
      // Mock bar exists
      db.execute.mockResolvedValueOnce([[{ id: 'bar-1' }]]);
      // Mock tag doesn't exist
      db.execute.mockResolvedValueOnce([[]]);

      const response = await request(app)
        .post('/bars/bar-1/tags/nonexistent-tag')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(404);

      expect(response.body.error).toBe('Tag not found');
    });

    test('should return 409 when tag is already associated with bar', async () => {
      // Mock bar exists
      db.execute.mockResolvedValueOnce([[{ id: 'bar-1' }]]);
      // Mock tag exists
      db.execute.mockResolvedValueOnce([[{ id: 'tag-1' }]]);
      // Mock relationship already exists
      db.execute.mockResolvedValueOnce([[{ bar_id: 'bar-1', tag_id: 'tag-1' }]]);

      const response = await request(app)
        .post('/bars/bar-1/tags/tag-1')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(409);

      expect(response.body.error).toBe('Tag is already associated with this bar');
    });

    test('should handle database errors during tag addition', async () => {
      // Mock bar exists
      db.execute.mockResolvedValueOnce([[{ id: 'bar-1' }]]);
      // Mock tag exists
      db.execute.mockResolvedValueOnce([[{ id: 'tag-1' }]]);
      // Mock relationship doesn't exist
      db.execute.mockResolvedValueOnce([[]]);
      // Mock database error during insert
      db.execute.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/bars/bar-1/tags/tag-1')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(500);

      expect(response.body.error).toBe('Failed to add tag to bar');
    });
  });

  describe('DELETE /bars/:barId/tags/:tagId - Remove Tag from Bar', () => {
    test('should successfully remove a tag from a bar with authentication', async () => {
      // Mock bar exists check
      db.execute.mockResolvedValueOnce([[{ id: 'bar-1' }]]);
      // Mock tag exists check
      db.execute.mockResolvedValueOnce([[{ id: 'tag-1' }]]);
      // Mock relationship exists check
      db.execute.mockResolvedValueOnce([[{ bar_id: 'bar-1', tag_id: 'tag-1' }]]);
      // Mock successful delete
      db.execute.mockResolvedValueOnce([{ affectedRows: 1 }]);

      const response = await request(app)
        .delete('/bars/bar-1/tags/tag-1')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Tag removed from bar successfully');
      expect(response.body.data.bar_id).toBe('bar-1');
      expect(response.body.data.tag_id).toBe('tag-1');
    });

    test('should require authentication', async () => {
      const response = await request(app)
        .delete('/bars/bar-1/tags/tag-1')
        .expect(401);

      expect(response.body.message).toBe('Access denied. No token provided or invalid format. Expected: Bearer <token>');
    });

    test('should return 404 when bar is not found', async () => {
      // Mock bar doesn't exist
      db.execute.mockResolvedValueOnce([[]]);

      const response = await request(app)
        .delete('/bars/nonexistent-bar/tags/tag-1')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(404);

      expect(response.body.error).toBe('Bar not found');
    });

    test('should return 404 when tag is not found', async () => {
      // Mock bar exists
      db.execute.mockResolvedValueOnce([[{ id: 'bar-1' }]]);
      // Mock tag doesn't exist
      db.execute.mockResolvedValueOnce([[]]);

      const response = await request(app)
        .delete('/bars/bar-1/tags/nonexistent-tag')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(404);

      expect(response.body.error).toBe('Tag not found');
    });

    test('should return 404 when tag is not associated with bar', async () => {
      // Mock bar exists
      db.execute.mockResolvedValueOnce([[{ id: 'bar-1' }]]);
      // Mock tag exists
      db.execute.mockResolvedValueOnce([[{ id: 'tag-1' }]]);
      // Mock relationship doesn't exist
      db.execute.mockResolvedValueOnce([[]]);

      const response = await request(app)
        .delete('/bars/bar-1/tags/tag-1')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(404);

      expect(response.body.error).toBe('Tag is not associated with this bar');
    });

    test('should handle case where delete operation affects no rows', async () => {
      // Mock bar exists
      db.execute.mockResolvedValueOnce([[{ id: 'bar-1' }]]);
      // Mock tag exists
      db.execute.mockResolvedValueOnce([[{ id: 'tag-1' }]]);
      // Mock relationship exists
      db.execute.mockResolvedValueOnce([[{ bar_id: 'bar-1', tag_id: 'tag-1' }]]);
      // Mock delete affects no rows (edge case)
      db.execute.mockResolvedValueOnce([{ affectedRows: 0 }]);

      const response = await request(app)
        .delete('/bars/bar-1/tags/tag-1')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(404);

      expect(response.body.error).toBe('Tag association not found');
    });

    test('should handle database errors during tag removal', async () => {
      // Mock bar exists
      db.execute.mockResolvedValueOnce([[{ id: 'bar-1' }]]);
      // Mock tag exists
      db.execute.mockResolvedValueOnce([[{ id: 'tag-1' }]]);
      // Mock relationship exists
      db.execute.mockResolvedValueOnce([[{ bar_id: 'bar-1', tag_id: 'tag-1' }]]);
      // Mock database error during delete
      db.execute.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .delete('/bars/bar-1/tags/tag-1')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(500);

      expect(response.body.error).toBe('Failed to remove tag from bar');
    });
  });

  describe('GET /bars/:barId/tags - Get Bar Tags', () => {
    test('should successfully return all tags associated with a bar', async () => {
      // Mock bar exists (first execute call)
      const mockBarRows = [{ id: 'bar-1', name: 'Test Bar' }];
      
      // Mock tags query (second execute call)
      const mockTags = [
        {
          id: 'tag-1',
          name: 'Sports Bar',
          category: 'Atmosphere',
          created_at: new Date('2024-01-01')
        },
        {
          id: 'tag-2',
          name: 'Live Music',
          category: 'Entertainment',
          created_at: new Date('2024-01-01')
        }
      ];
      
      // Setup connection mocks in order
      mockConnection.execute
        .mockResolvedValueOnce([mockBarRows])  // First call: check bar exists
        .mockResolvedValueOnce([mockTags]);    // Second call: get tags

      const response = await request(app)
        .get('/bars/bar-1/tags')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0]).toMatchObject({
        id: 'tag-1',
        name: 'Sports Bar',
        category: 'Atmosphere'
      });
      expect(response.body.data[1]).toMatchObject({
        id: 'tag-2',
        name: 'Live Music',
        category: 'Entertainment'
      });
      expect(response.body.meta).toMatchObject({
        bar: {
          id: 'bar-1',
          name: 'Test Bar'
        },
        total: 2
      });
    });

    test('should return empty array when bar has no tags', async () => {
      // Mock bar exists
      const mockBarRows = [{ id: 'bar-1', name: 'Test Bar' }];
      
      // Mock empty tags result
      mockConnection.execute
        .mockResolvedValueOnce([mockBarRows])  // First call: check bar exists
        .mockResolvedValueOnce([[]]);          // Second call: get tags (empty)

      const response = await request(app)
        .get('/bars/bar-1/tags')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual([]);
      expect(response.body.meta.total).toBe(0);
      expect(response.body.meta.bar).toMatchObject({
        id: 'bar-1',
        name: 'Test Bar'
      });
    });

    test('should return 404 when bar is not found', async () => {
      // Mock bar not found
      mockConnection.execute.mockResolvedValueOnce([[]]);  // Bar not found

      const response = await request(app)
        .get('/bars/nonexistent/tags')
        .expect(404);

      expect(response.body.error).toBe('Bar not found');
    });

    test('should return 404 when bar is soft deleted', async () => {
      // Mock soft deleted bar (empty result)
      mockConnection.execute.mockResolvedValueOnce([[]]);  // Bar not found (soft deleted)

      const response = await request(app)
        .get('/bars/deleted-bar/tags')
        .expect(404);

      expect(response.body.error).toBe('Bar not found');
    });

    test('should handle database errors gracefully', async () => {
      mockConnection.execute.mockRejectedValueOnce(new Error('Database error'));

      const response = await request(app)
        .get('/bars/bar-1/tags')
        .expect(500);

      expect(response.body.error).toBe('Failed to fetch bar tags');
    });

    test('should return tags sorted alphabetically by name', async () => {
      // Mock bar exists
      const mockBarRows = [{ id: 'bar-1', name: 'Test Bar' }];
      
      // Mock tags in alphabetical order
      const mockTags = [
        {
          id: 'tag-1',
          name: 'Craft Beer',
          category: 'Beverages',
          created_at: new Date('2024-01-01')
        },
        {
          id: 'tag-2',
          name: 'Sports Bar',
          category: 'Atmosphere',
          created_at: new Date('2024-01-01')
        }
      ];
      
      mockConnection.execute
        .mockResolvedValueOnce([mockBarRows])
        .mockResolvedValueOnce([mockTags]);

      const response = await request(app)
        .get('/bars/bar-1/tags')
        .expect(200);

      expect(response.body.data[0].name).toBe('Craft Beer');
      expect(response.body.data[1].name).toBe('Sports Bar');
    });

    test('should include all tag fields in response', async () => {
      // Mock bar exists
      const mockBarRows = [{ id: 'bar-1', name: 'Test Bar' }];
      
      // Mock single tag with all fields
      const mockTags = [
        {
          id: 'tag-1',
          name: 'Sports Bar',
          category: 'Atmosphere',
          created_at: new Date('2024-01-01T10:00:00Z')
        }
      ];
      
      mockConnection.execute
        .mockResolvedValueOnce([mockBarRows])
        .mockResolvedValueOnce([mockTags]);

      const response = await request(app)
        .get('/bars/bar-1/tags')
        .expect(200);

      expect(response.body.data[0]).toHaveProperty('id');
      expect(response.body.data[0]).toHaveProperty('name');
      expect(response.body.data[0]).toHaveProperty('category');
      expect(response.body.data[0]).toHaveProperty('created_at');
    });
  });
});