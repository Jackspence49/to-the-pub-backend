const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/utils/db');
const {
  createMockUser,
  createLoginCredentials,
  mockDbResponses,
  expectSuccessfulLoginResponse,
  validateJWTToken
} = require('../helpers/authHelpers');

// Mock the database module
jest.mock('../../src/utils/db');

describe('POST /users/login - Advanced Success Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Successful Login Scenarios', () => {
    test('should login successfully with helper functions', async () => {
      // Create test data using helpers
      const testUser = createMockUser({
        email: 'advanced.test@example.com',
        full_name: 'Advanced Test User'
      });
      
      const credentials = createLoginCredentials({
        email: testUser.email,
        password: 'testpassword123'
      });

      // Mock database response
      db.execute = jest.fn().mockResolvedValue(
        mockDbResponses.validUser(testUser)
      );

      // Make request
      const response = await request(app)
        .post('/users/login')
        .send(credentials);

      // Use helper to verify response
      expectSuccessfulLoginResponse(response, testUser);
      
      // Use helper to validate JWT
      const decodedToken = validateJWTToken(response.body.token, {
        userId: testUser.id,
        email: testUser.email,
        role: testUser.role
      });

      // Additional assertions
      expect(decodedToken.exp - decodedToken.iat).toBe(86400); // 24 hours in seconds
    });

    test('should handle user with different roles correctly', async () => {
      const testRoles = ['super_admin', 'venue_owner', 'staff', 'manager', 'user'];
      
      for (const role of testRoles) {
        // Clear mocks for each iteration
        jest.clearAllMocks();
        
        const testUser = createMockUser({
          email: `${role.toLowerCase()}@example.com`,
          role: role,
          full_name: `${role} User`
        });
        
        const credentials = createLoginCredentials({
          email: testUser.email
        });

        db.execute = jest.fn().mockResolvedValue(
          mockDbResponses.validUser(testUser)
        );

        const response = await request(app)
          .post('/users/login')
          .send(credentials);

        expectSuccessfulLoginResponse(response, testUser);
        
        // Verify role is correctly set in JWT
        const decodedToken = validateJWTToken(response.body.token);
        expect(decodedToken.role).toBe(role);
      }
    });

    test('should handle email normalization (case insensitive)', async () => {
      const testUser = createMockUser({
        email: 'test@example.com' // stored as lowercase
      });

      const testEmails = [
        'TEST@EXAMPLE.COM',
        'Test@Example.Com',
        'test@EXAMPLE.com',
        'TEST@example.COM'
      ];

      for (const emailVariant of testEmails) {
        jest.clearAllMocks();
        
        const credentials = createLoginCredentials({
          email: emailVariant
        });

        db.execute = jest.fn().mockResolvedValue(
          mockDbResponses.validUser(testUser)
        );

        const response = await request(app)
          .post('/users/login')
          .send(credentials);

        expectSuccessfulLoginResponse(response, testUser);
        
        // Verify database was queried with lowercase email
        expect(db.execute).toHaveBeenCalledWith(
          'SELECT id, email, password_hash, full_name, role FROM web_users WHERE email = ? LIMIT 1',
          ['test@example.com'] // Should be normalized to lowercase
        );
      }
    });

    test('should handle user with minimal data (null full_name)', async () => {
      const testUser = createMockUser({
        full_name: null // User without full name
      });
      
      const credentials = createLoginCredentials({
        email: testUser.email
      });

      db.execute = jest.fn().mockResolvedValue(
        mockDbResponses.validUser(testUser)
      );

      const response = await request(app)
        .post('/users/login')
        .send(credentials);

      expectSuccessfulLoginResponse(response, testUser);
      
      // Verify null full_name is handled correctly
      expect(response.body.data.full_name).toBeNull();
    });

    test('should generate tokens with proper timestamps', async () => {
      const testUser = createMockUser();
      const credentials = createLoginCredentials({
        email: testUser.email
      });

      db.execute = jest.fn().mockResolvedValue(
        mockDbResponses.validUser(testUser)
      );

      const response = await request(app)
        .post('/users/login')
        .send(credentials);

      expectSuccessfulLoginResponse(response, testUser);
      
      // Decode token and verify timestamps are reasonable
      const decodedToken = validateJWTToken(response.body.token);
      
      const now = Math.floor(Date.now() / 1000);
      const tokenIat = decodedToken.iat;
      const tokenExp = decodedToken.exp;
      
      // Token should be issued within the last few seconds
      expect(tokenIat).toBeGreaterThan(now - 5);
      expect(tokenIat).toBeLessThanOrEqual(now);
      
      // Token should expire in approximately 24 hours (86400 seconds)
      expect(tokenExp - tokenIat).toBe(86400);
      
      // Verify token is currently valid (not expired)
      expect(tokenExp).toBeGreaterThan(now);
    });
  });

  describe('Response Format Validation', () => {
    test('should have consistent response format', async () => {
      const testUser = createMockUser();
      const credentials = createLoginCredentials({
        email: testUser.email
      });

      db.execute = jest.fn().mockResolvedValue(
        mockDbResponses.validUser(testUser)
      );

      const response = await request(app)
        .post('/users/login')
        .send(credentials)
        .expect(200)
        .expect('Content-Type', /json/);

      // Verify exact response structure
      expect(Object.keys(response.body)).toEqual(['data', 'token']);
      expect(Object.keys(response.body.data)).toEqual(['id', 'email', 'full_name', 'role']);
      
      // Verify data types
      expect(typeof response.body.data.id).toBe('string');
      expect(typeof response.body.data.email).toBe('string');
      expect(['string', 'object']).toContain(typeof response.body.data.full_name); // string or null
      expect(typeof response.body.data.role).toBe('string');
      expect(typeof response.body.token).toBe('string');
    });
  });
});