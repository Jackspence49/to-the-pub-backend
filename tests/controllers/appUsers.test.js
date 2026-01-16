const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const db = require('../../src/utils/db');

jest.mock('../../src/utils/db');

describe('App Users Authentication Flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /app-users/register', () => {
    test('creates a new app user and returns a JWT', async () => {
      db.execute = jest.fn().mockResolvedValue([{ affectedRows: 1 }]);

      const payload = {
        email: 'User@Example.com',
        password: 'Password123',
        full_name: 'Test App User'
      };

      const response = await request(app)
        .post('/app-users/register')
        .send(payload)
        .expect(201);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('token');
      expect(response.body.data.email).toBe('user@example.com');

      expect(db.execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO app_users'),
        expect.arrayContaining([
          expect.any(String),
          'user@example.com',
          expect.any(String),
          'Test App User'
        ])
      );
    });

    test('rejects duplicate emails', async () => {
      const duplicateError = new Error('duplicate');
      duplicateError.code = 'ER_DUP_ENTRY';
      db.execute = jest.fn().mockRejectedValue(duplicateError);

      const response = await request(app)
        .post('/app-users/register')
        .send({ email: 'taken@example.com', password: 'Password123' })
        .expect(409);

      expect(response.body).toHaveProperty('error', 'Email already registered');
    });
  });

  describe('POST /app-users/login', () => {
    test('logs in an existing app user', async () => {
      const passwordHash = await bcrypt.hash('Password123', 10);

      db.execute = jest.fn()
        .mockResolvedValueOnce([[{
          id: 'app-user-1',
          email: 'user@example.com',
          password_hash: passwordHash,
          full_name: 'Test User',
          is_active: 1
        }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      const response = await request(app)
        .post('/app-users/login')
        .send({ email: 'user@example.com', password: 'Password123' })
        .expect(200);

      expect(response.body).toHaveProperty('token');
      const decoded = jwt.verify(response.body.token, process.env.JWT_SECRET);
      expect(decoded).toMatchObject({
        userId: 'app-user-1',
        email: 'user@example.com',
        userType: 'app_user'
      });
      expect(db.execute).toHaveBeenCalledTimes(2);
    });

    test('rejects invalid credentials', async () => {
      const passwordHash = await bcrypt.hash('Password123', 10);
      db.execute = jest.fn().mockResolvedValue([[{
        id: 'app-user-1',
        email: 'user@example.com',
        password_hash: passwordHash,
        full_name: 'Test User',
        is_active: 1
      }]]);

      await request(app)
        .post('/app-users/login')
        .send({ email: 'user@example.com', password: 'WrongPassword' })
        .expect(401);

      expect(db.execute).toHaveBeenCalledTimes(1);
    });
  });

  describe('GET /app-users/me', () => {
    test('returns profile data for an authenticated app user', async () => {
      const token = jwt.sign(
        { userId: 'app-user-1', email: 'user@example.com', userType: 'app_user' },
        process.env.JWT_SECRET
      );

      db.execute = jest.fn().mockResolvedValue([[{
        id: 'app-user-1',
        email: 'user@example.com',
        full_name: 'Profile User',
        phone: null,
        last_login: null,
        created_at: new Date()
      }]]);

      const response = await request(app)
        .get('/app-users/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.data).toMatchObject({
        id: 'app-user-1',
        email: 'user@example.com',
        full_name: 'Profile User'
      });
      expect(db.execute).toHaveBeenCalledTimes(1);
    });

    test('rejects non app-user tokens', async () => {
      const token = jwt.sign(
        { userId: 'web-user-1', email: 'admin@example.com', userType: 'web_user' },
        process.env.JWT_SECRET
      );

      const response = await request(app)
        .get('/app-users/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      expect(response.body).toHaveProperty('error', 'App user authentication required');
    });
  });
});
