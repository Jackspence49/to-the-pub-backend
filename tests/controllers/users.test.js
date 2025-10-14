const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const db = require('../../src/utils/db');

// Mock the database module
jest.mock('../../src/utils/db');

describe('POST /users/login - Success Test', () => {
  let testUser;
  
  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
    
    // Setup test user data
    testUser = {
      id: 'test-user-id-123',
      email: 'testuser@example.com',
      password_hash: '', // Will be set in beforeEach
      full_name: 'Test User',
      role: 'super_admin',
      created_at: new Date()
    };
    
    // Create a hashed password for testing
    const saltRounds = 10;
    testUser.password_hash = bcrypt.hashSync('testpassword123', saltRounds);
  });

  test('should successfully login with correct credentials and return JWT token', async () => {
    // Mock database response for successful user lookup
    const mockExecute = jest.fn().mockResolvedValue([
      [testUser] // MySQL returns results in nested array format
    ]);
    
    db.execute = mockExecute;

    // Make login request with correct credentials
    const loginData = {
      email: 'testuser@example.com',
      password: 'testpassword123'
    };

    const response = await request(app)
      .post('/users/login')
      .send(loginData)
      .expect(200);

    // Verify the response structure
    expect(response.body).toHaveProperty('data');
    expect(response.body).toHaveProperty('token');

    // Verify user data in response
    expect(response.body.data).toEqual({
      id: testUser.id,
      email: testUser.email,
      full_name: testUser.full_name,
      role: testUser.role
    });

    // Verify JWT token is present and valid
    expect(response.body.token).toBeDefined();
    expect(typeof response.body.token).toBe('string');
    
    // Decode and verify JWT token contents
    const decodedToken = jwt.decode(response.body.token);
    expect(decodedToken).toHaveProperty('userId', testUser.id);
    expect(decodedToken).toHaveProperty('email', testUser.email);
    expect(decodedToken).toHaveProperty('role', testUser.role);
    expect(decodedToken).toHaveProperty('exp'); // Token should have expiration
    expect(decodedToken).toHaveProperty('iat'); // Token should have issued at time

    // Verify JWT token can be verified with the secret
    expect(() => {
      jwt.verify(response.body.token, process.env.JWT_SECRET);
    }).not.toThrow();

    // Verify database was called correctly
    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(mockExecute).toHaveBeenCalledWith(
      'SELECT id, email, password_hash, full_name, role FROM web_users WHERE email = ? LIMIT 1',
      [loginData.email.toLowerCase()]
    );
  });

  test('should handle case-insensitive email login', async () => {
    // Mock database response
    const mockExecute = jest.fn().mockResolvedValue([
      [testUser]
    ]);
    
    db.execute = mockExecute;

    // Test with uppercase email
    const loginData = {
      email: 'TESTUSER@EXAMPLE.COM',
      password: 'testpassword123'
    };

    const response = await request(app)
      .post('/users/login')
      .send(loginData)
      .expect(200);

    // Verify successful login
    expect(response.body.data.email).toBe(testUser.email);
    expect(response.body.token).toBeDefined();

    // Verify database was called with lowercase email
    expect(mockExecute).toHaveBeenCalledWith(
      'SELECT id, email, password_hash, full_name, role FROM web_users WHERE email = ? LIMIT 1',
      ['testuser@example.com'] // Should be converted to lowercase
    );
  });

  test('should return valid JWT token with correct expiration', async () => {
    // Mock database response
    const mockExecute = jest.fn().mockResolvedValue([
      [testUser]
    ]);
    
    db.execute = mockExecute;

    const loginData = {
      email: 'testuser@example.com',
      password: 'testpassword123'
    };

    const response = await request(app)
      .post('/users/login')
      .send(loginData)
      .expect(200);

    // Decode token and check expiration (should be 24 hours from now)
    const decodedToken = jwt.decode(response.body.token);
    const tokenExpiration = new Date(decodedToken.exp * 1000);
    const expectedExpiration = new Date(Date.now() + (24 * 60 * 60 * 1000)); // 24 hours from now
    
    // Allow 1 minute tolerance for execution time
    const timeDifference = Math.abs(tokenExpiration.getTime() - expectedExpiration.getTime());
    expect(timeDifference).toBeLessThan(60000); // Less than 1 minute difference
  });

  test('should work with minimal user data (no full_name)', async () => {
    // Create test user without full_name
    const minimalUser = {
      ...testUser,
      full_name: null
    };

    // Mock database response
    const mockExecute = jest.fn().mockResolvedValue([
      [minimalUser]
    ]);
    
    db.execute = mockExecute;

    const loginData = {
      email: 'testuser@example.com',
      password: 'testpassword123'
    };

    const response = await request(app)
      .post('/users/login')
      .send(loginData)
      .expect(200);

    // Verify response handles null full_name gracefully
    expect(response.body.data).toEqual({
      id: minimalUser.id,
      email: minimalUser.email,
      full_name: null,
      role: minimalUser.role
    });

    expect(response.body.token).toBeDefined();
  });

  test('should work for different user roles', async () => {
    // Test with different user roles
    const roles = ['super_admin', 'venue_owner', 'staff', 'manager', 'user'];
    
    for (const role of roles) {
      // Clear mocks for each iteration
      jest.clearAllMocks();
      
      const roleTestUser = {
        ...testUser,
        role: role,
        id: `test-user-${role}`
      };

      const mockExecute = jest.fn().mockResolvedValue([
        [roleTestUser]
      ]);
      
      db.execute = mockExecute;

      const loginData = {
        email: 'testuser@example.com',
        password: 'testpassword123'
      };

      const response = await request(app)
        .post('/users/login')
        .send(loginData)
        .expect(200);

      // Verify role is correctly returned
      expect(response.body.data.role).toBe(role);
      
      // Verify role is in JWT token
      const decodedToken = jwt.decode(response.body.token);
      expect(decodedToken.role).toBe(role);
    }
  });
});