// Test helpers for user authentication testing

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

/**
 * Creates a mock user object for testing
 * @param {Object} overrides - Properties to override in the default user
 * @returns {Object} Mock user object
 */
function createMockUser(overrides = {}) {
  const defaultUser = {
    id: uuidv4(),
    email: 'test@example.com',
    password_hash: bcrypt.hashSync('testpassword123', 10),
    full_name: 'Test User',
    role: 'super_admin',
    created_at: new Date(),
    updated_at: new Date()
  };

  return { ...defaultUser, ...overrides };
}

/**
 * Creates a valid JWT token for testing
 * @param {Object} payload - JWT payload
 * @param {String} secret - JWT secret (optional, uses process.env.JWT_SECRET)
 * @param {Object} options - JWT options (optional)
 * @returns {String} JWT token
 */
function createTestJWT(payload, secret = null, options = {}) {
  const defaultPayload = {
    userId: uuidv4(),
    email: 'test@example.com',
    role: 'user'
  };

  const jwtSecret = secret || process.env.JWT_SECRET || 'test-secret';
  const defaultOptions = { expiresIn: '24h' };

  return jwt.sign(
    { ...defaultPayload, ...payload },
    jwtSecret,
    { ...defaultOptions, ...options }
  );
}

/**
 * Creates valid login credentials for testing
 * @param {Object} overrides - Properties to override
 * @returns {Object} Login credentials
 */
function createLoginCredentials(overrides = {}) {
  const defaults = {
    email: 'test@example.com',
    password: 'testpassword123'
  };

  return { ...defaults, ...overrides };
}

/**
 * Mock database responses for different scenarios
 */
const mockDbResponses = {
  // Successful user lookup
  validUser: (user) => [
    [user] // MySQL returns results in nested array format
  ],
  
  // No user found
  noUser: [
    [] // Empty array
  ],
  
  // Database error
  dbError: () => {
    throw new Error('Database connection failed');
  }
};

/**
 * Common test expectations for successful login responses
 * @param {Object} response - SuperTest response object
 * @param {Object} expectedUser - Expected user data
 */
function expectSuccessfulLoginResponse(response, expectedUser) {
  // Check response status
  expect(response.status).toBe(200);
  
  // Check response structure
  expect(response.body).toHaveProperty('data');
  expect(response.body).toHaveProperty('token');
  
  // Check user data (should not include password_hash)
  expect(response.body.data).toEqual({
    id: expectedUser.id,
    email: expectedUser.email,
    full_name: expectedUser.full_name,
    role: expectedUser.role
  });
  
  // Check token
  expect(response.body.token).toBeDefined();
  expect(typeof response.body.token).toBe('string');
  
  // Verify token can be decoded
  const decodedToken = jwt.decode(response.body.token);
  expect(decodedToken).toHaveProperty('userId', expectedUser.id);
  expect(decodedToken).toHaveProperty('email', expectedUser.email);
  expect(decodedToken).toHaveProperty('role', expectedUser.role);
  expect(decodedToken).toHaveProperty('exp');
  expect(decodedToken).toHaveProperty('iat');
}

/**
 * Validates JWT token structure and content
 * @param {String} token - JWT token to validate
 * @param {Object} expectedPayload - Expected payload content
 */
function validateJWTToken(token, expectedPayload = {}) {
  // Verify token exists and is a string
  expect(token).toBeDefined();
  expect(typeof token).toBe('string');
  
  // Verify token can be decoded
  const decoded = jwt.decode(token);
  expect(decoded).toBeTruthy();
  
  // Check expected payload properties
  Object.keys(expectedPayload).forEach(key => {
    expect(decoded[key]).toBe(expectedPayload[key]);
  });
  
  // Verify token can be verified with secret
  expect(() => {
    jwt.verify(token, process.env.JWT_SECRET);
  }).not.toThrow();
  
  return decoded;
}

module.exports = {
  createMockUser,
  createTestJWT,
  createLoginCredentials,
  mockDbResponses,
  expectSuccessfulLoginResponse,
  validateJWTToken
};