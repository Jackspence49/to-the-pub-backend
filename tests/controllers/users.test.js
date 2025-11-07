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

describe('POST /users/forgot-password', () => {
  let testUser;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    testUser = {
      id: 'test-user-id-123',
      email: 'testuser@example.com',
      password_hash: bcrypt.hashSync('testpassword123', 10),
      full_name: 'Test User',
      role: 'user',
      created_at: new Date()
    };
  });

  test('should successfully initiate password reset for existing user', async () => {
    // Mock database response for user lookup
    const mockExecute = jest.fn()
      .mockResolvedValueOnce([[testUser]]) // First call: user lookup
      .mockResolvedValueOnce([{ affectedRows: 1 }]); // Second call: token update
    
    db.execute = mockExecute;

    const response = await request(app)
      .post('/users/forgot-password')
      .send({ email: 'testuser@example.com' })
      .expect(200);

    // Verify response structure
    expect(response.body).toEqual({
      success: true,
      message: 'Password reset initiated successfully',
      resetToken: expect.any(String)
    });

    // Verify reset token format (UUID + timestamp)
    expect(response.body.resetToken).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-\d+$/);

    // Verify database calls
    expect(mockExecute).toHaveBeenCalledTimes(2);
    
    // First call should be user lookup
    expect(mockExecute).toHaveBeenNthCalledWith(1,
      'SELECT id, email FROM web_users WHERE email = ? LIMIT 1',
      ['testuser@example.com']
    );

    // Second call should be token update
    expect(mockExecute).toHaveBeenNthCalledWith(2,
      'UPDATE web_users SET reset_token = ?, reset_token_expires = ? WHERE id = ?',
      [expect.any(String), expect.any(Date), testUser.id]
    );
  });

  test('should return success for non-existent email (security)', async () => {
    // Mock database response for non-existent user
    const mockExecute = jest.fn().mockResolvedValue([[]]);
    db.execute = mockExecute;

    const response = await request(app)
      .post('/users/forgot-password')
      .send({ email: 'nonexistent@example.com' })
      .expect(200);

    // Should return generic success message for security
    expect(response.body).toEqual({
      success: true,
      message: 'If the email exists, a password reset link has been sent'
    });

    // Should not include resetToken for non-existent users
    expect(response.body.resetToken).toBeUndefined();

    // Should only call database once for user lookup
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  test('should handle case-insensitive email normalization', async () => {
    const mockExecute = jest.fn()
      .mockResolvedValueOnce([[testUser]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    
    db.execute = mockExecute;

    const response = await request(app)
      .post('/users/forgot-password')
      .send({ email: 'TESTUSER@EXAMPLE.COM' })
      .expect(200);

    expect(response.body.success).toBe(true);

    // Verify email was normalized to lowercase
    expect(mockExecute).toHaveBeenNthCalledWith(1,
      'SELECT id, email FROM web_users WHERE email = ? LIMIT 1',
      ['testuser@example.com']
    );
  });

  test('should return 400 for missing email', async () => {
    const response = await request(app)
      .post('/users/forgot-password')
      .send({})
      .expect(400);

    expect(response.body).toEqual({
      error: 'Email is required'
    });
  });

  test('should return 500 on database error', async () => {
    const mockExecute = jest.fn().mockRejectedValue(new Error('Database connection failed'));
    db.execute = mockExecute;

    const response = await request(app)
      .post('/users/forgot-password')
      .send({ email: 'testuser@example.com' })
      .expect(500);

    expect(response.body).toEqual({
      error: 'Failed to initiate password reset'
    });
  });
});

describe('POST /users/reset-password', () => {
  let testUser;
  let validToken;
  let futureExpiration;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    validToken = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890-1699372800000';
    futureExpiration = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
    
    testUser = {
      id: 'test-user-id-123',
      email: 'testuser@example.com',
      reset_token: validToken,
      reset_token_expires: futureExpiration
    };
  });

  test('should successfully reset password with valid token', async () => {
    const mockExecute = jest.fn()
      .mockResolvedValueOnce([[testUser]]) // First call: token lookup
      .mockResolvedValueOnce([{ affectedRows: 1 }]); // Second call: password update
    
    db.execute = mockExecute;

    const response = await request(app)
      .post('/users/reset-password')
      .send({
        token: validToken,
        newPassword: 'newSecurePassword123'
      })
      .expect(200);

    expect(response.body).toEqual({
      success: true,
      message: 'Password reset successfully'
    });

    // Verify database calls
    expect(mockExecute).toHaveBeenCalledTimes(2);
    
    // First call: token validation
    expect(mockExecute).toHaveBeenNthCalledWith(1,
      expect.stringContaining('SELECT id, email, reset_token, reset_token_expires'),
      [validToken]
    );

    // Second call: password update and token cleanup
    const secondCall = mockExecute.mock.calls[1];
    expect(secondCall[0]).toContain('UPDATE web_users');
    expect(secondCall[0]).toContain('SET password_hash = ?');
    expect(secondCall[0]).toContain('reset_token = NULL');
    expect(secondCall[0]).toContain('reset_token_expires = NULL');
    expect(secondCall[0]).toContain('WHERE id = ?');
    expect(secondCall[1]).toEqual([expect.any(String), testUser.id]);
  });

  test('should return 400 for missing token', async () => {
    const response = await request(app)
      .post('/users/reset-password')
      .send({ newPassword: 'newPassword123' })
      .expect(400);

    expect(response.body).toEqual({
      error: 'Token and new password are required'
    });
  });

  test('should return 400 for missing password', async () => {
    const response = await request(app)
      .post('/users/reset-password')
      .send({ token: validToken })
      .expect(400);

    expect(response.body).toEqual({
      error: 'Token and new password are required'
    });
  });

  test('should return 422 for password too short', async () => {
    const response = await request(app)
      .post('/users/reset-password')
      .send({
        token: validToken,
        newPassword: '123' // Too short
      })
      .expect(422);

    expect(response.body).toEqual({
      error: 'Password must be at least 8 characters'
    });
  });

  test('should return 401 for invalid token', async () => {
    // Mock database response for invalid token
    const mockExecute = jest.fn().mockResolvedValue([[]]);
    db.execute = mockExecute;

    const response = await request(app)
      .post('/users/reset-password')
      .send({
        token: 'invalid-token',
        newPassword: 'newPassword123'
      })
      .expect(401);

    expect(response.body).toEqual({
      error: 'Invalid or expired reset token'
    });
  });

  test('should return 401 for expired token', async () => {
    // Create expired token scenario by mocking empty result
    const mockExecute = jest.fn().mockResolvedValue([[]]);
    db.execute = mockExecute;

    const response = await request(app)
      .post('/users/reset-password')
      .send({
        token: validToken,
        newPassword: 'newPassword123'
      })
      .expect(401);

    expect(response.body).toEqual({
      error: 'Invalid or expired reset token'
    });

    // Verify the SQL query includes expiration check
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('reset_token_expires > NOW()'),
      [validToken]
    );
  });

  test('should hash new password securely', async () => {
    const mockExecute = jest.fn()
      .mockResolvedValueOnce([[testUser]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    
    db.execute = mockExecute;

    const newPassword = 'newSecurePassword123';
    
    await request(app)
      .post('/users/reset-password')
      .send({
        token: validToken,
        newPassword: newPassword
      })
      .expect(200);

    // Get the hashed password from the update call
    const updateCall = mockExecute.mock.calls[1];
    const hashedPassword = updateCall[1][0];

    // Verify it's a bcrypt hash (starts with $2a$ or $2b$ and is 60 chars)
    expect(hashedPassword).toMatch(/^\$2[ab]\$\d+\$.{53}$/);
    
    // Verify the hash is correct for the password
    expect(bcrypt.compareSync(newPassword, hashedPassword)).toBe(true);
    
    // Verify it's not the plain password
    expect(hashedPassword).not.toBe(newPassword);
  });

  test('should return 500 on database error', async () => {
    const mockExecute = jest.fn().mockRejectedValue(new Error('Database error'));
    db.execute = mockExecute;

    const response = await request(app)
      .post('/users/reset-password')
      .send({
        token: validToken,
        newPassword: 'newPassword123'
      })
      .expect(500);

    expect(response.body).toEqual({
      error: 'Failed to reset password'
    });
  });
});

describe('Password Reset Integration Flow', () => {
  test('should complete full password reset flow', async () => {
    let resetToken;
    
    const testUser = {
      id: 'test-user-id-123',
      email: 'testuser@example.com',
      password_hash: bcrypt.hashSync('oldPassword123', 10),
      full_name: 'Test User',
      role: 'user'
    };

    // Step 1: Initiate password reset
    const mockExecuteForgot = jest.fn()
      .mockResolvedValueOnce([[testUser]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    
    db.execute = mockExecuteForgot;

    const forgotResponse = await request(app)
      .post('/users/forgot-password')
      .send({ email: testUser.email })
      .expect(200);

    resetToken = forgotResponse.body.resetToken;
    expect(resetToken).toBeDefined();

    // Step 2: Reset password with token
    jest.clearAllMocks();
    
    const userWithToken = {
      ...testUser,
      reset_token: resetToken,
      reset_token_expires: new Date(Date.now() + 60 * 60 * 1000)
    };

    const mockExecuteReset = jest.fn()
      .mockResolvedValueOnce([[userWithToken]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    
    db.execute = mockExecuteReset;

    const resetResponse = await request(app)
      .post('/users/reset-password')
      .send({
        token: resetToken,
        newPassword: 'newSecurePassword123'
      })
      .expect(200);

    expect(resetResponse.body).toEqual({
      success: true,
      message: 'Password reset successfully'
    });

    // Verify token cleanup in the update call
    const updateCall = mockExecuteReset.mock.calls[1];
    expect(updateCall[0]).toContain('reset_token = NULL');
    expect(updateCall[0]).toContain('reset_token_expires = NULL');
  });
});