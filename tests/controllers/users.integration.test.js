const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const app = require('../../src/app');
const db = require('../../src/utils/db');

/**
 * Integration Test for Login Success
 * 
 * This test creates a real user in the database and tests the complete login flow.
 * Note: This requires a test database to be set up and running.
 * 
 * To run this test safely:
 * 1. Set up a separate test database
 * 2. Update your .env file or create a .env.test file with test DB credentials
 * 3. Ensure the database is clean before each test
 */
describe('POST /users/login - Integration Test', () => {
  let testUser;
  let testUserId;
  let testPassword = 'testpassword123';

  beforeAll(async () => {
    // Create a test user directly in the database
    testUserId = uuidv4();
    const hashedPassword = await bcrypt.hash(testPassword, 10);
    
    testUser = {
      id: testUserId,
      email: 'integration.test@example.com',
      password_hash: hashedPassword,
      full_name: 'Integration Test User',
      role: 'super_admin'
    };

    // Insert test user - only run if we have a test database connection
    try {
      const insertSql = `INSERT INTO web_users (id, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)`;
      await db.execute(insertSql, [
        testUser.id,
        testUser.email,
        testUser.password_hash,
        testUser.full_name,
        testUser.role
      ]);
    } catch (error) {
      console.log('Database not available for integration test, skipping...');
      // If database is not available, we'll skip this test
      return;
    }
  });

  afterAll(async () => {
    // Clean up: remove the test user
    try {
      const deleteSql = `DELETE FROM web_users WHERE id = ?`;
      await db.execute(deleteSql, [testUserId]);
    } catch (error) {
      // Ignore cleanup errors
      console.log('Could not clean up test user');
    }
  });

  test('should successfully login with real database integration', async () => {
    // Skip test if database is not properly set up
    try {
      // Quick database connectivity check
      await db.execute('SELECT 1');
    } catch (error) {
      console.log('Skipping integration test - database not available');
      return;
    }

    const loginData = {
      email: testUser.email,
      password: testPassword
    };

    const response = await request(app)
      .post('/users/login')
      .send(loginData)
      .expect(200);

    // Verify response structure
    expect(response.body).toHaveProperty('data');
    expect(response.body).toHaveProperty('token');

    // Verify user data
    expect(response.body.data).toEqual({
      id: testUser.id,
      email: testUser.email,
      full_name: testUser.full_name,
      role: testUser.role
    });

    // Verify JWT token
    expect(response.body.token).toBeDefined();
    
    // Verify token can be decoded and contains correct data
    const decodedToken = jwt.verify(response.body.token, process.env.JWT_SECRET);
    expect(decodedToken.userId).toBe(testUser.id);
    expect(decodedToken.email).toBe(testUser.email);
    expect(decodedToken.role).toBe(testUser.role);

    // Verify token expiration is approximately 24 hours from now
    const tokenExpiration = new Date(decodedToken.exp * 1000);
    const expectedExpiration = new Date(Date.now() + (24 * 60 * 60 * 1000));
    const timeDifference = Math.abs(tokenExpiration.getTime() - expectedExpiration.getTime());
    expect(timeDifference).toBeLessThan(60000); // Within 1 minute tolerance
  });

  test('should authenticate protected routes with returned JWT token', async () => {
    // Skip test if database is not properly set up
    try {
      await db.execute('SELECT 1');
    } catch (error) {
      console.log('Skipping integration test - database not available');
      return;
    }

    // First, login to get a token
    const loginResponse = await request(app)
      .post('/users/login')
      .send({
        email: testUser.email,
        password: testPassword
      })
      .expect(200);

    const token = loginResponse.body.token;

    // Then use the token to access a protected route
    const profileResponse = await request(app)
      .get('/users/profile')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // Verify we get the correct user profile
    expect(profileResponse.body.success).toBe(true);
    expect(profileResponse.body.data.id).toBe(testUser.id);
    expect(profileResponse.body.data.email).toBe(testUser.email);
    expect(profileResponse.body.data.full_name).toBe(testUser.full_name);
    expect(profileResponse.body.data.role).toBe(testUser.role);
  });
});