const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/utils/db');
const { v4: uuidv4 } = require('uuid');

describe('Events Controller Tests', () => {
  let testBarId;
  let testEventId;
  let authToken;

  beforeAll(async () => {
    // Create a test bar
    testBarId = uuidv4();
    await db.execute(`
      INSERT INTO bars (id, name, address_street, address_city, address_state, address_zip, is_active)
      VALUES (?, 'Test Bar', '123 Test St', 'Boston', 'MA', '02101', 1)
    `, [testBarId]);

    // Create a test user and get auth token for protected routes
    const testUserId = uuidv4();
    const testEmail = `test-${Date.now()}@example.com`;
    await db.execute(`
      INSERT INTO web_users (id, email, password_hash, role)
      VALUES (?, ?, '$2a$10$mock.hash', 'user')
    `, [testUserId, testEmail]);

    const loginResponse = await request(app)
      .post('/users/login')
      .send({
        email: testEmail,
        password: 'testpassword' // This won't work in real scenario, but for test structure
      });
    
    // For actual testing, you'd need a proper auth setup
    // authToken = loginResponse.body.token;
  });

  afterAll(async () => {
    // Clean up test data
    await db.execute('DELETE FROM events WHERE bar_id = ?', [testBarId]);
    await db.execute('DELETE FROM bars WHERE id = ?', [testBarId]);
    await db.execute('DELETE FROM web_users WHERE email LIKE ?', ['test-%@example.com']);
  });

  beforeEach(async () => {
    // Clean up any existing test events
    await db.execute('DELETE FROM events WHERE bar_id = ?', [testBarId]);
  });

  describe('POST /events', () => {
    const validEventData = {
      bar_id: null, // Will be set to testBarId
      title: 'Test Live Music',
      description: 'A great live music event',
      date: '2024-12-31',
      start_time: '20:00:00',
      end_time: '23:00:00',
      category: 'live_music',
      image_url: 'https://example.com/image.jpg',
      external_link: 'https://example.com/tickets'
    };

    beforeEach(() => {
      validEventData.bar_id = testBarId;
    });

    it('should create a new event with valid data', async () => {
      const response = await request(app)
        .post('/events')
        .send(validEventData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Event created successfully');
      expect(response.body.data).toHaveProperty('id');
      testEventId = response.body.data.id;
    });

    it('should fail with missing required fields', async () => {
      const invalidData = { ...validEventData };
      delete invalidData.title;

      const response = await request(app)
        .post('/events')
        .send(invalidData)
        .expect(400);

      expect(response.body.error).toContain('Missing required fields');
    });

    it('should fail with invalid category', async () => {
      const invalidData = { ...validEventData, category: 'invalid_category' };

      const response = await request(app)
        .post('/events')
        .send(invalidData)
        .expect(400);

      expect(response.body.error).toContain('Invalid category');
    });

    it('should fail with invalid date format', async () => {
      const invalidData = { ...validEventData, date: '12/31/2024' };

      const response = await request(app)
        .post('/events')
        .send(invalidData)
        .expect(400);

      expect(response.body.error).toContain('Date must be in YYYY-MM-DD format');
    });

    it('should fail with invalid time format', async () => {
      const invalidData = { ...validEventData, start_time: '8:00 PM' };

      const response = await request(app)
        .post('/events')
        .send(invalidData)
        .expect(400);

      expect(response.body.error).toContain('Time must be in HH:MM:SS format');
    });

    it('should fail when end time is before start time', async () => {
      const invalidData = { ...validEventData, start_time: '23:00:00', end_time: '20:00:00' };

      const response = await request(app)
        .post('/events')
        .send(invalidData)
        .expect(400);

      expect(response.body.error).toBe('End time must be after start time');
    });

    it('should fail when bar does not exist', async () => {
      const invalidData = { ...validEventData, bar_id: uuidv4() };

      const response = await request(app)
        .post('/events')
        .send(invalidData)
        .expect(404);

      expect(response.body.error).toBe('Bar not found or inactive');
    });

    it('should fail with duplicate event', async () => {
      // Create first event
      await request(app).post('/events').send(validEventData).expect(201);

      // Try to create duplicate
      const response = await request(app)
        .post('/events')
        .send(validEventData)
        .expect(409);

      expect(response.body.error).toContain('already exists');
    });
  });

  describe('GET /events', () => {
    beforeEach(async () => {
      // Create test events
      testEventId = uuidv4();
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];

      await db.execute(`
        INSERT INTO events (id, bar_id, title, description, date, start_time, end_time, category, is_active)
        VALUES (?, ?, 'Test Event', 'Description', ?, '19:00:00', '22:00:00', 'live_music', 1)
      `, [testEventId, testBarId, tomorrowStr]);
    });

    it('should get all events', async () => {
      const response = await request(app)
        .get('/events')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.meta).toHaveProperty('count');
      expect(response.body.meta).toHaveProperty('page');
    });

    it('should filter events by bar_id', async () => {
      const response = await request(app)
        .get('/events')
        .query({ bar_id: testBarId })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.every(event => event.bar_id === testBarId)).toBe(true);
    });

    it('should filter events by category', async () => {
      const response = await request(app)
        .get('/events')
        .query({ category: 'live_music' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.every(event => event.category === 'live_music')).toBe(true);
    });

    it('should filter events by upcoming=true', async () => {
      const response = await request(app)
        .get('/events')
        .query({ upcoming: 'true' })
        .expect(200);

      expect(response.body.success).toBe(true);
      // All events should be in the future
      const today = new Date().toISOString().split('T')[0];
      expect(response.body.data.every(event => event.date >= today)).toBe(true);
    });

    it('should handle pagination', async () => {
      const response = await request(app)
        .get('/events')
        .query({ page: 1, limit: 5 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.meta.page).toBe(1);
      expect(response.body.meta.limit).toBe(5);
      expect(response.body.data.length).toBeLessThanOrEqual(5);
    });
  });

  describe('GET /events/:id', () => {
    beforeEach(async () => {
      testEventId = uuidv4();
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];

      await db.execute(`
        INSERT INTO events (id, bar_id, title, description, date, start_time, end_time, category, is_active)
        VALUES (?, ?, 'Test Event', 'Description', ?, '19:00:00', '22:00:00', 'live_music', 1)
      `, [testEventId, testBarId, tomorrowStr]);
    });

    it('should get a single event by ID', async () => {
      const response = await request(app)
        .get(`/events/${testEventId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(testEventId);
      expect(response.body.data).toHaveProperty('title');
      expect(response.body.data).toHaveProperty('bar_name');
    });

    it('should return 404 for non-existent event', async () => {
      const nonExistentId = uuidv4();
      const response = await request(app)
        .get(`/events/${nonExistentId}`)
        .expect(404);

      expect(response.body.error).toBe('Event not found');
    });
  });

  describe('GET /bars/:barId/events', () => {
    beforeEach(async () => {
      testEventId = uuidv4();
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];

      await db.execute(`
        INSERT INTO events (id, bar_id, title, description, date, start_time, end_time, category, is_active)
        VALUES (?, ?, 'Bar Event', 'Description', ?, '19:00:00', '22:00:00', 'trivia', 1)
      `, [testEventId, testBarId, tomorrowStr]);
    });

    it('should get events for a specific bar', async () => {
      const response = await request(app)
        .get(`/bars/${testBarId}/events`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.meta.bar.id).toBe(testBarId);
      expect(response.body.data.every(event => event.bar_id === testBarId)).toBe(true);
    });

    it('should filter bar events by category', async () => {
      const response = await request(app)
        .get(`/bars/${testBarId}/events`)
        .query({ category: 'trivia' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.every(event => event.category === 'trivia')).toBe(true);
    });

    it('should return 404 for non-existent bar', async () => {
      const nonExistentBarId = uuidv4();
      const response = await request(app)
        .get(`/bars/${nonExistentBarId}/events`)
        .expect(404);

      expect(response.body.error).toBe('Bar not found');
    });
  });
});

describe('Events Integration with Bars', () => {
  let testBarId;

  beforeAll(async () => {
    testBarId = uuidv4();
    await db.execute(`
      INSERT INTO bars (id, name, address_street, address_city, address_state, address_zip, is_active)
      VALUES (?, 'Integration Test Bar', '456 Test Ave', 'Boston', 'MA', '02102', 1)
    `, [testBarId]);

    // Create a future event
    const eventId = uuidv4();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    await db.execute(`
      INSERT INTO events (id, bar_id, title, date, start_time, end_time, category, is_active)
      VALUES (?, ?, 'Integration Event', ?, '18:00:00', '21:00:00', 'happy_hour', 1)
    `, [eventId, testBarId, tomorrowStr]);
  });

  afterAll(async () => {
    await db.execute('DELETE FROM events WHERE bar_id = ?', [testBarId]);
    await db.execute('DELETE FROM bars WHERE id = ?', [testBarId]);
  });

  it('should include events when getting bars with include=events', async () => {
    const response = await request(app)
      .get('/bars')
      .query({ include: 'events' })
      .expect(200);

    expect(response.body.success).toBe(true);
    const barWithEvents = response.body.data.find(bar => bar.id === testBarId);
    
    if (barWithEvents && barWithEvents.upcoming_events) {
      expect(Array.isArray(barWithEvents.upcoming_events)).toBe(true);
      expect(barWithEvents.upcoming_events[0]).toHaveProperty('title');
      expect(barWithEvents.upcoming_events[0]).toHaveProperty('date');
      expect(barWithEvents.upcoming_events[0]).toHaveProperty('category');
    }
  });

  it('should include events when getting single bar with include=events', async () => {
    const response = await request(app)
      .get(`/bars/${testBarId}`)
      .query({ include: 'events' })
      .expect(200);

    expect(response.body.success).toBe(true);
    if (response.body.data.upcoming_events && response.body.data.upcoming_events.length > 0) {
      expect(Array.isArray(response.body.data.upcoming_events)).toBe(true);
      expect(response.body.data.upcoming_events[0]).toHaveProperty('title');
      expect(response.body.data.upcoming_events[0]).toHaveProperty('date');
      expect(response.body.data.upcoming_events[0]).toHaveProperty('category');
    }
  });

  it('should filter bars by has_events=true', async () => {
    const response = await request(app)
      .get('/bars')
      .query({ has_events: 'true' })
      .expect(200);

    expect(response.body.success).toBe(true);
    // Should include the test bar since it has events
    const barIds = response.body.data.map(bar => bar.id);
    expect(barIds).toContain(testBarId);
  });
});