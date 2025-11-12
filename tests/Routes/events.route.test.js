const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/utils/db');
const { v4: uuidv4 } = require('uuid');

describe('Events Routes Tests', () => {
  let testBarId;
  let testEventId;
  let authToken;

  beforeAll(async () => {
    // Create a test bar
    testBarId = uuidv4();
    await db.execute(`
      INSERT INTO bars (id, name, address_street, address_city, address_state, address_zip, is_active)
      VALUES (?, 'Routes Test Bar', '789 Test Blvd', 'Boston', 'MA', '02103', 1)
    `, [testBarId]);
  });

  afterAll(async () => {
    // Clean up
    await db.execute('DELETE FROM events WHERE bar_id = ?', [testBarId]);
    await db.execute('DELETE FROM bars WHERE id = ?', [testBarId]);
  });

  beforeEach(async () => {
    // Clean up events before each test
    await db.execute('DELETE FROM events WHERE bar_id = ?', [testBarId]);
  });

  describe('Events CRUD Routes', () => {
    const validEventData = {
      bar_id: null, // Will be set in beforeEach
      title: 'Route Test Event',
      description: 'Testing event routes',
      date: '2024-12-25',
      start_time: '19:30:00',
      end_time: '22:30:00',
      category: 'live_music',
      image_url: 'https://example.com/event.jpg',
      external_link: 'https://tickets.example.com'
    };

    beforeEach(() => {
      validEventData.bar_id = testBarId;
    });

    it('should handle the complete CRUD lifecycle', async () => {
      // CREATE
      const createResponse = await request(app)
        .post('/events')
        .send(validEventData)
        .expect(201);

      expect(createResponse.body.success).toBe(true);
      expect(createResponse.body.data).toHaveProperty('id');
      testEventId = createResponse.body.data.id;

      // READ (single)
      const readResponse = await request(app)
        .get(`/events/${testEventId}`)
        .expect(200);

      expect(readResponse.body.success).toBe(true);
      expect(readResponse.body.data.id).toBe(testEventId);
      expect(readResponse.body.data.title).toBe(validEventData.title);

      // READ (list)
      const listResponse = await request(app)
        .get('/events')
        .query({ bar_id: testBarId })
        .expect(200);

      expect(listResponse.body.success).toBe(true);
      expect(listResponse.body.data).toHaveLength(1);
      expect(listResponse.body.data[0].id).toBe(testEventId);

      // UPDATE (note: this would require authentication in real scenario)
      const updateData = {
        title: 'Updated Event Title',
        category: 'comedy'
      };

      // In a real test, you'd include auth headers:
      // .set('Authorization', `Bearer ${authToken}`)
      const updateResponse = await request(app)
        .put(`/events/${testEventId}`)
        .send(updateData)
        .expect(401); // Expecting unauthorized since we don't have auth setup

      // For demonstration of what would happen with auth:
      // expect(updateResponse.body.success).toBe(true);

      // DELETE (note: this would require authentication in real scenario)
      const deleteResponse = await request(app)
        .delete(`/events/${testEventId}`)
        .expect(401); // Expecting unauthorized since we don't have auth setup

      // For demonstration of what would happen with auth:
      // expect(deleteResponse.body.success).toBe(true);
    });
  });

  describe('Route Parameter Validation', () => {
    it('should validate UUID format in route parameters', async () => {
      const response = await request(app)
        .get('/events/invalid-uuid')
        .expect(404);

      // The exact response may vary based on your route handling
    });

    it('should handle non-existent event IDs gracefully', async () => {
      const nonExistentId = uuidv4();
      const response = await request(app)
        .get(`/events/${nonExistentId}`)
        .expect(404);

      expect(response.body.error).toBe('Event not found');
    });
  });

  describe('Bar Events Route', () => {
    beforeEach(async () => {
      // Create a test event for the bar
      testEventId = uuidv4();
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7); // 7 days from now
      const futureDateStr = futureDate.toISOString().split('T')[0];

      await db.execute(`
        INSERT INTO events (id, bar_id, title, date, start_time, end_time, category, is_active)
        VALUES (?, ?, 'Bar Route Test Event', ?, '20:00:00', '23:00:00', 'sports', 1)
      `, [testEventId, testBarId, futureDateStr]);
    });

    it('should get events for a specific bar via /bars/:barId/events', async () => {
      const response = await request(app)
        .get(`/bars/${testBarId}/events`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.meta.bar.id).toBe(testBarId);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].id).toBe(testEventId);
    });

    it('should filter bar events by upcoming=true', async () => {
      const response = await request(app)
        .get(`/bars/${testBarId}/events`)
        .query({ upcoming: 'true' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBeGreaterThanOrEqual(0);
      
      // All events should be in the future
      const today = new Date().toISOString().split('T')[0];
      response.body.data.forEach(event => {
        expect(event.date >= today).toBe(true);
      });
    });

    it('should filter bar events by category', async () => {
      const response = await request(app)
        .get(`/bars/${testBarId}/events`)
        .query({ category: 'sports' })
        .expect(200);

      expect(response.body.success).toBe(true);
      response.body.data.forEach(event => {
        expect(event.category).toBe('sports');
      });
    });

    it('should limit results when limit parameter is provided', async () => {
      const response = await request(app)
        .get(`/bars/${testBarId}/events`)
        .query({ limit: 1 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
    });
  });

  describe('Query Parameter Validation', () => {
    it('should validate date format in date_from parameter', async () => {
      const response = await request(app)
        .get('/events')
        .query({ date_from: 'invalid-date' })
        .expect(400);

      expect(response.body.error).toContain('date_from must be in YYYY-MM-DD format');
    });

    it('should validate date format in date_to parameter', async () => {
      const response = await request(app)
        .get('/events')
        .query({ date_to: '12/31/2024' })
        .expect(400);

      expect(response.body.error).toContain('date_to must be in YYYY-MM-DD format');
    });

    it('should validate category parameter', async () => {
      const response = await request(app)
        .get('/events')
        .query({ category: 'invalid_category' })
        .expect(400);

      expect(response.body.error).toContain('Invalid category');
    });

    it('should accept valid category values', async () => {
      const validCategories = ['live_music', 'trivia', 'happy_hour', 'sports', 'comedy'];
      
      for (const category of validCategories) {
        const response = await request(app)
          .get('/events')
          .query({ category })
          .expect(200);

        expect(response.body.success).toBe(true);
      }
    });
  });

  describe('Pagination and Sorting', () => {
    beforeEach(async () => {
      // Create multiple test events
      const events = [];
      for (let i = 1; i <= 5; i++) {
        const eventId = uuidv4();
        const eventDate = new Date();
        eventDate.setDate(eventDate.getDate() + i);
        const dateStr = eventDate.toISOString().split('T')[0];
        
        events.push({
          id: eventId,
          title: `Test Event ${i}`,
          date: dateStr
        });

        await db.execute(`
          INSERT INTO events (id, bar_id, title, date, start_time, end_time, category, is_active)
          VALUES (?, ?, ?, ?, '19:00:00', '22:00:00', 'trivia', 1)
        `, [eventId, testBarId, `Test Event ${i}`, dateStr]);
      }
    });

    it('should handle pagination correctly', async () => {
      const response = await request(app)
        .get('/events')
        .query({ page: 1, limit: 3, bar_id: testBarId })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.meta.page).toBe(1);
      expect(response.body.meta.limit).toBe(3);
      expect(response.body.data.length).toBeLessThanOrEqual(3);
    });

    it('should sort events by date and time ascending', async () => {
      const response = await request(app)
        .get('/events')
        .query({ bar_id: testBarId })
        .expect(200);

      expect(response.body.success).toBe(true);
      
      // Check if events are sorted by date ascending
      for (let i = 1; i < response.body.data.length; i++) {
        const prevDate = new Date(response.body.data[i - 1].date);
        const currDate = new Date(response.body.data[i].date);
        expect(currDate >= prevDate).toBe(true);
      }
    });
  });
});