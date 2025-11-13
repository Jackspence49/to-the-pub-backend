const db = require('../utils/db');
const { v4: uuidv4 } = require('uuid');

/**
 * POST /events
 * Creates a new event for a bar
 * Expected payload shape:
 * {
 *   bar_id: 'uuid',
 *   title: 'string',
 *   description: 'string', // optional
 *   date: 'YYYY-MM-DD',
 *   start_time: 'HH:MM:SS',
 *   end_time: 'HH:MM:SS',
 *   image_url: 'string', // optional
 *   category: 'live_music|trivia|happy_hour|sports|comedy',
 *   external_link: 'string' // optional
 * }
 */
async function createEvent(req, res) {
  const payload = req.body;

  // Basic validation
  if (!payload || !payload.bar_id || !payload.title || !payload.date || 
      !payload.start_time || !payload.end_time || !payload.category) {
    return res.status(400).json({ 
      error: 'Missing required fields: bar_id, title, date, start_time, end_time, category' 
    });
  }

  // Validate category
  const validCategories = ['live_music', 'trivia', 'happy_hour', 'sports', 'comedy'];
  if (!validCategories.includes(payload.category)) {
    return res.status(400).json({ 
      error: `Invalid category. Must be one of: ${validCategories.join(', ')}` 
    });
  }

  // Validate date format (YYYY-MM-DD)
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(payload.date)) {
    return res.status(400).json({ 
      error: 'Date must be in YYYY-MM-DD format' 
    });
  }

  // Validate time format (HH:MM:SS)
  const timeRegex = /^([01]?\d|2[0-3]):[0-5]\d:[0-5]\d$/;
  if (!timeRegex.test(payload.start_time) || !timeRegex.test(payload.end_time)) {
    return res.status(400).json({ 
      error: 'Time must be in HH:MM:SS format' 
    });
  }

  // Check that end_time is after start_time
  if (payload.start_time >= payload.end_time) {
    return res.status(400).json({ 
      error: 'End time must be after start time' 
    });
  }

  // Validate that date is not in the past
  const eventDate = new Date(payload.date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (eventDate < today) {
    return res.status(400).json({ 
      error: 'Event date cannot be in the past' 
    });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Check if bar exists and is active
    const barCheckSql = `SELECT id, name FROM bars WHERE id = ? AND is_active = 1`;
    const [barRows] = await conn.execute(barCheckSql, [payload.bar_id]);

    if (barRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Bar not found or inactive' });
    }

    // Check for duplicate event (same bar, title, date, and time)
    const duplicateCheckSql = `
      SELECT id FROM events 
      WHERE bar_id = ? AND LOWER(TRIM(title)) = LOWER(TRIM(?)) 
      AND date = ? AND start_time = ? AND is_active = 1
    `;
    const [duplicateRows] = await conn.execute(duplicateCheckSql, [
      payload.bar_id, payload.title, payload.date, payload.start_time
    ]);

    if (duplicateRows.length > 0) {
      await conn.rollback();
      return res.status(409).json({ error: 'An event with this title, date, and time already exists for this bar' });
    }

    // Insert the new event
    const eventId = uuidv4();
    const insertEventSql = `
      INSERT INTO events (
        id, bar_id, title, description, date, start_time, end_time, 
        image_url, category, external_link, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const eventParams = [
      eventId,
      payload.bar_id,
      payload.title,
      payload.description || null,
      payload.date,
      payload.start_time,
      payload.end_time,
      payload.image_url || null,
      payload.category,
      payload.external_link || null,
      1
    ];
    
    await conn.execute(insertEventSql, eventParams);
    await conn.commit();

    return res.status(201).json({ 
      success: true,
      message: 'Event created successfully',
      data: { id: eventId, bar_name: barRows[0].name }
    });
  } catch (err) {
    await conn.rollback();
    console.error('Error creating event:', err.message || err);
    return res.status(500).json({ error: 'Failed to create event' });
  } finally {
    conn.release();
  }
}

/**
 * GET /events?bar_id=uuid&category=live_music&date_from=2024-01-01&date_to=2024-12-31&tag_ids=uuid1,uuid2&page=1&limit=20
 * Returns events with optional filtering
 * Query parameters:
 * - bar_id: filter by specific bar
 * - category: filter by event category
 * - date_from: filter events from this date (YYYY-MM-DD)
 * - date_to: filter events until this date (YYYY-MM-DD)
 * - upcoming: if 'true', only show future events
 * - tag_ids: comma-separated list of tag IDs to filter by
 * - page: page number for pagination (default: 1)
 * - limit: maximum number of results per page (default: 20)
 */
async function getAllEvents(req, res) {
  try {
    const { 
      bar_id, 
      category, 
      date_from, 
      date_to, 
      upcoming, 
      tag_ids,
      page = 1, 
      limit = 20 
    } = req.query;

    // Validate date formats if provided
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (date_from && !dateRegex.test(date_from)) {
      return res.status(400).json({ error: 'date_from must be in YYYY-MM-DD format' });
    }
    if (date_to && !dateRegex.test(date_to)) {
      return res.status(400).json({ error: 'date_to must be in YYYY-MM-DD format' });
    }

    // Validate category if provided
    if (category) {
      const validCategories = ['live_music', 'trivia', 'happy_hour', 'sports', 'comedy'];
      if (!validCategories.includes(category)) {
        return res.status(400).json({ 
          error: `Invalid category. Must be one of: ${validCategories.join(', ')}` 
        });
      }
    }

    // Parse tag_ids if provided
    let tagIdArray = [];
    if (tag_ids) {
      tagIdArray = tag_ids.split(',').map(id => id.trim()).filter(id => id.length > 0);
    }

    // Build dynamic query
    let selectClauses = ['e.*', 'b.name as bar_name', 'b.address_city', 'b.address_state'];
    let joinClauses = ['INNER JOIN bars b ON e.bar_id = b.id'];
    let whereClauses = ['e.is_active = 1', 'b.is_active = 1'];
    let params = [];

    // Add tag filtering with EXISTS subquery if tag_ids provided
    if (tagIdArray.length > 0) {
      const tagPlaceholders = tagIdArray.map(() => '?').join(',');
      whereClauses.push(`EXISTS (
        SELECT 1 FROM event_tag_assignments eta
        WHERE eta.event_id = e.id AND eta.tag_id IN (${tagPlaceholders})
      )`);
      params.push(...tagIdArray);
    }

    // Add filter conditions
    if (bar_id) {
      whereClauses.push('e.bar_id = ?');
      params.push(bar_id);
    }

    if (category) {
      whereClauses.push('e.category = ?');
      params.push(category);
    }

    if (date_from) {
      whereClauses.push('e.date >= ?');
      params.push(date_from);
    }

    if (date_to) {
      whereClauses.push('e.date <= ?');
      params.push(date_to);
    }

    if (upcoming === 'true') {
      whereClauses.push('e.date >= CURDATE()');
    }

    // Construct query
    let selectSql = `SELECT ${selectClauses.join(', ')} FROM events e`;
    selectSql += ` ${joinClauses.join(' ')}`;
    selectSql += ` WHERE ${whereClauses.join(' AND ')}`;
    selectSql += ` ORDER BY e.date ASC, e.start_time ASC`;

    // Add pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;
    selectSql += ` LIMIT ? OFFSET ?`;
    params.push(limitNum, offset);

    const [rows] = await db.query(selectSql, params);

    // Get total count for pagination metadata
    let countSql = `SELECT COUNT(*) as total FROM events e INNER JOIN bars b ON e.bar_id = b.id WHERE ${whereClauses.join(' AND ')}`;
    const [countRows] = await db.query(countSql, params.slice(0, -2)); // Remove limit and offset params
    const totalCount = countRows[0].total;

    return res.json({ 
      success: true, 
      data: rows,
      meta: {
        count: rows.length,
        total: totalCount,
        page: pageNum,
        limit: limitNum,
        total_pages: Math.ceil(totalCount / limitNum),
        filters: { 
          bar_id, 
          category, 
          date_from, 
          date_to, 
          upcoming,
          tag_ids
        }
      }
    });
  } catch (err) {
    console.error('Error fetching events:', err.message || err);
    return res.status(500).json({ error: 'Failed to fetch events' });
  }
}

/**
 * GET /events/:id
 * Returns a single event by ID with its tags
 */
async function getEvent(req, res) {
  try {
    const eventId = req.params.id;

    const selectSql = `
      SELECT 
        e.*, 
        b.name as bar_name,
        b.address_street,
        b.address_city, 
        b.address_state,
        b.address_zip,
        b.phone,
        b.website
      FROM events e
      INNER JOIN bars b ON e.bar_id = b.id
      WHERE e.id = ? AND e.is_active = 1 AND b.is_active = 1
    `;

    const [rows] = await db.query(selectSql, [eventId]);

    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const event = rows[0];

    // Get event tags
    const tagsSql = `
      SELECT et.id, et.name
      FROM event_tags et
      INNER JOIN event_tag_assignments eta ON et.id = eta.tag_id
      WHERE eta.event_id = ?
      ORDER BY et.name
    `;
    const [tagRows] = await db.query(tagsSql, [eventId]);
    event.tags = tagRows;

    return res.json({ 
      success: true, 
      data: event
    });
  } catch (err) {
    console.error('Error fetching event:', err.message || err);
    return res.status(500).json({ error: 'Failed to fetch event' });
  }
}

/**
 * PUT /events/:id
 * Updates an existing event (protected route)
 */
async function updateEvent(req, res) {
  try {
    const eventId = req.params.id;
    const payload = req.body;
    const userId = req.user.userId; // From JWT

    // Check if event exists and is active
    const checkSql = `SELECT id, bar_id, title FROM events WHERE id = ? AND is_active = 1`;
    const [checkRows] = await db.execute(checkSql, [eventId]);

    if (!checkRows || checkRows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Validate category if provided
    if (payload.category) {
      const validCategories = ['live_music', 'trivia', 'happy_hour', 'sports', 'comedy'];
      if (!validCategories.includes(payload.category)) {
        return res.status(400).json({ 
          error: `Invalid category. Must be one of: ${validCategories.join(', ')}` 
        });
      }
    }

    // Validate date format if provided
    if (payload.date) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(payload.date)) {
        return res.status(400).json({ 
          error: 'Date must be in YYYY-MM-DD format' 
        });
      }

      // Validate that date is not in the past
      const eventDate = new Date(payload.date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (eventDate < today) {
        return res.status(400).json({ 
          error: 'Event date cannot be in the past' 
        });
      }
    }

    // Validate time format if provided
    if (payload.start_time || payload.end_time) {
      const timeRegex = /^([01]?\d|2[0-3]):[0-5]\d:[0-5]\d$/;
      if (payload.start_time && !timeRegex.test(payload.start_time)) {
        return res.status(400).json({ 
          error: 'start_time must be in HH:MM:SS format' 
        });
      }
      if (payload.end_time && !timeRegex.test(payload.end_time)) {
        return res.status(400).json({ 
          error: 'end_time must be in HH:MM:SS format' 
        });
      }
    }

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      // Check for duplicate if title, date, or time is being updated
      if (payload.title || payload.date || payload.start_time) {
        const duplicateCheckSql = `
          SELECT id FROM events 
          WHERE bar_id = ? AND LOWER(TRIM(title)) = LOWER(TRIM(?)) 
          AND date = ? AND start_time = ? AND id != ? AND is_active = 1
        `;
        const [duplicateRows] = await conn.execute(duplicateCheckSql, [
          checkRows[0].bar_id,
          payload.title || checkRows[0].title,
          payload.date || checkRows[0].date,
          payload.start_time || checkRows[0].start_time,
          eventId
        ]);

        if (duplicateRows.length > 0) {
          await conn.rollback();
          return res.status(409).json({ error: 'An event with this title, date, and time already exists for this bar' });
        }
      }

      // Update event
      const updateSql = `
        UPDATE events SET 
          title = COALESCE(?, title),
          description = COALESCE(?, description),
          date = COALESCE(?, date),
          start_time = COALESCE(?, start_time),
          end_time = COALESCE(?, end_time),
          image_url = COALESCE(?, image_url),
          category = COALESCE(?, category),
          external_link = COALESCE(?, external_link),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;

      await conn.execute(updateSql, [
        payload.title || null,
        payload.description || null,
        payload.date || null,
        payload.start_time || null,
        payload.end_time || null,
        payload.image_url || null,
        payload.category || null,
        payload.external_link || null,
        eventId
      ]);

      await conn.commit();

      return res.json({ 
        success: true, 
        message: 'Event updated successfully',
        data: { id: eventId }
      });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('Error updating event:', err.message || err);
    return res.status(500).json({ error: 'Failed to update event' });
  }
}

/**
 * DELETE /events/:id
 * Soft deletes an event (sets is_active to false) - (protected route)
 */
async function deleteEvent(req, res) {
  try {
    const eventId = req.params.id;
    const userId = req.user.userId; // From JWT

    const deleteSql = `UPDATE events SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND is_active = 1`;
    const [result] = await db.execute(deleteSql, [eventId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    return res.json({ 
      success: true, 
      message: 'Event deleted successfully',
      data: { id: eventId }
    });
  } catch (err) {
    console.error('Error deleting event:', err.message || err);
    return res.status(500).json({ error: 'Failed to delete event' });
  }
}

/**
 * GET /bars/:barId/events
 * Returns all events for a specific bar
 * Query parameters:
 * - upcoming: if 'true', only show future events
 * - category: filter by event category
 * - limit: maximum number of results (default: 50)
 */
async function getBarEvents(req, res) {
  try {
    const barId = req.params.barId;
    const { upcoming, category, limit = 50 } = req.query;

    // Check if bar exists and is active
    const barCheckSql = `SELECT id, name FROM bars WHERE id = ? AND is_active = 1`;
    const [barRows] = await db.execute(barCheckSql, [barId]);

    if (!barRows || barRows.length === 0) {
      return res.status(404).json({ error: 'Bar not found' });
    }

    // Build query
    let whereClauses = ['bar_id = ?', 'is_active = 1'];
    let params = [barId];

    if (upcoming === 'true') {
      whereClauses.push('date >= CURDATE()');
    }

    if (category) {
      const validCategories = ['live_music', 'trivia', 'happy_hour', 'sports', 'comedy'];
      if (!validCategories.includes(category)) {
        return res.status(400).json({ 
          error: `Invalid category. Must be one of: ${validCategories.join(', ')}` 
        });
      }
      whereClauses.push('category = ?');
      params.push(category);
    }

    const selectSql = `
      SELECT * FROM events 
      WHERE ${whereClauses.join(' AND ')} 
      ORDER BY date ASC, start_time ASC 
      LIMIT ?
    `;
    params.push(parseInt(limit));

    const [rows] = await db.query(selectSql, params);

    return res.json({
      success: true,
      data: rows,
      meta: {
        bar: {
          id: barRows[0].id,
          name: barRows[0].name
        },
        count: rows.length,
        filters: { upcoming, category, limit }
      }
    });
  } catch (err) {
    console.error('Error fetching bar events:', err.message || err);
    return res.status(500).json({ error: 'Failed to fetch bar events' });
  }
}

/**
 * GET /tags/:tagId/events
 * Returns all events assigned to a specific tag
 * Query parameters:
 * - upcoming: if 'true', only show future events
 * - limit: maximum number of results (default: 50)
 */
async function getEventsByTag(req, res) {
  try {
    const tagId = req.params.tagId;
    const { upcoming, limit = 50 } = req.query;

    // Check if tag exists
    const tagCheckSql = `SELECT id, name FROM event_tags WHERE id = ?`;
    const [tagRows] = await db.execute(tagCheckSql, [tagId]);

    if (!tagRows || tagRows.length === 0) {
      return res.status(404).json({ error: 'Event tag not found' });
    }

    // Build query
    let whereClauses = ['e.is_active = 1', 'b.is_active = 1', 'eta.tag_id = ?'];
    let params = [tagId];

    if (upcoming === 'true') {
      whereClauses.push('e.date >= CURDATE()');
    }

    const selectSql = `
      SELECT 
        e.*, 
        b.name as bar_name, 
        b.address_city, 
        b.address_state
      FROM events e
      INNER JOIN bars b ON e.bar_id = b.id
      INNER JOIN event_tag_assignments eta ON e.id = eta.event_id
      WHERE ${whereClauses.join(' AND ')} 
      ORDER BY e.date ASC, e.start_time ASC 
      LIMIT ?
    `;
    params.push(parseInt(limit));

    const [rows] = await db.query(selectSql, params);

    return res.json({
      success: true,
      data: rows,
      meta: {
        tag: {
          id: tagRows[0].id,
          name: tagRows[0].name
        },
        count: rows.length,
        filters: { upcoming, limit }
      }
    });
  } catch (err) {
    console.error('Error fetching events by tag:', err.message || err);
    return res.status(500).json({ error: 'Failed to fetch events by tag' });
  }
}

module.exports = {
  createEvent,
  getAllEvents,
  getEvent,
  updateEvent,
  deleteEvent,
  getBarEvents,
  getEventsByTag
};