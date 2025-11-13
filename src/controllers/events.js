const db = require('../utils/db');
const { v4: uuidv4 } = require('uuid');
const { 
  generateEventInstances, 
  validateRecurrenceData, 
  getRecurrenceDescription 
} = require('../utils/eventRecurrence');

/**
 * POST /events
 * Creates a new event (recurring or one-time) with instances
 * Expected payload shape:
 * {
 *   bar_id: 'uuid',
 *   title: 'string',
 *   description: 'string', // optional
 *   start_time: 'HH:MM:SS',
 *   end_time: 'HH:MM:SS',
 *   image_url: 'string', // optional
 *   category: 'live_music|trivia|happy_hour|sports|comedy',
 *   external_link: 'string', // optional
 *   recurrence_pattern: 'none|daily|weekly|monthly', // default: 'none'
 *   recurrence_days: [0,1,2,3,4,5,6], // array of day numbers, required for weekly/monthly
 *   recurrence_start_date: 'YYYY-MM-DD', // required for recurring events, or single event date
 *   recurrence_end_date: 'YYYY-MM-DD' // required for recurring events
 * }
 */
async function createEvent(req, res) {
  const payload = req.body;

  // Basic validation
  if (!payload || !payload.bar_id || !payload.title || 
      !payload.start_time || !payload.end_time || !payload.category) {
    return res.status(400).json({ 
      error: 'Missing required fields: bar_id, title, start_time, end_time, category' 
    });
  }

  // Set default recurrence pattern
  const recurrencePattern = payload.recurrence_pattern || 'none';
  
  // For non-recurring events, require recurrence_start_date as the event date
  if (recurrencePattern === 'none' && !payload.recurrence_start_date) {
    return res.status(400).json({ 
      error: 'recurrence_start_date is required (use as event date for one-time events)' 
    });
  }

  // Validate category
  const validCategories = ['live_music', 'trivia', 'happy_hour', 'sports', 'comedy'];
  if (!validCategories.includes(payload.category)) {
    return res.status(400).json({ 
      error: `Invalid category. Must be one of: ${validCategories.join(', ')}` 
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

  // Validate recurrence data
  const recurrenceData = {
    recurrence_pattern: recurrencePattern,
    recurrence_days: payload.recurrence_days,
    recurrence_start_date: payload.recurrence_start_date,
    recurrence_end_date: payload.recurrence_end_date
  };
  
  const validation = validateRecurrenceData(recurrenceData);
  if (!validation.isValid) {
    return res.status(400).json({ 
      error: 'Recurrence validation failed',
      details: validation.errors 
    });
  }

  // Validate that start date is not in the past
  const startDate = new Date(payload.recurrence_start_date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (startDate < today) {
    return res.status(400).json({ 
      error: 'Event start date cannot be in the past' 
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

    // Create the master event
    const eventId = uuidv4();
    const insertEventSql = `
      INSERT INTO events (
        id, bar_id, title, description, start_time, end_time, 
        image_url, category, external_link, recurrence_pattern, 
        recurrence_days, recurrence_start_date, recurrence_end_date, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const eventParams = [
      eventId,
      payload.bar_id,
      payload.title,
      payload.description || null,
      payload.start_time,
      payload.end_time,
      payload.image_url || null,
      payload.category,
      payload.external_link || null,
      recurrencePattern,
      recurrencePattern !== 'none' ? JSON.stringify(payload.recurrence_days || []) : null,
      payload.recurrence_start_date,
      payload.recurrence_end_date || payload.recurrence_start_date, // For one-time events, end = start
      1
    ];
    
    await conn.execute(insertEventSql, eventParams);

    // Generate and insert event instances
    const eventForGeneration = {
      id: eventId,
      recurrence_pattern: recurrencePattern,
      recurrence_days: payload.recurrence_days,
      recurrence_start_date: payload.recurrence_start_date,
      recurrence_end_date: payload.recurrence_end_date || payload.recurrence_start_date
    };

    const instances = generateEventInstances(eventForGeneration);
    
    if (instances.length > 0) {
      const insertInstanceSql = `
        INSERT INTO event_instances (id, event_id, date) 
        VALUES (?, ?, ?)
      `;
      
      for (const instance of instances) {
        const instanceId = uuidv4();
        await conn.execute(insertInstanceSql, [instanceId, instance.event_id, instance.date]);
      }
    }

    await conn.commit();

    return res.status(201).json({ 
      success: true,
      message: 'Event created successfully',
      data: { 
        id: eventId, 
        bar_name: barRows[0].name,
        recurrence_description: getRecurrenceDescription(eventForGeneration),
        instances_created: instances.length
      }
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
 * GET /events/instances?bar_id=uuid&category=live_music&date_from=2024-01-01&date_to=2024-12-31&upcoming=true&page=1&limit=20
 * Returns event instances with optional filtering
 * This replaces the old getAllEvents function to work with the new schema
 */
async function getEventInstances(req, res) {
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

    // Build dynamic query using the view for better performance
    let baseView = upcoming === 'true' ? 'upcoming_event_instances' : 'all_event_instances';
    let selectClauses = ['*'];
    let whereClauses = [];
    let params = [];

    // Add tag filtering with EXISTS subquery if tag_ids provided
    if (tagIdArray.length > 0) {
      const tagPlaceholders = tagIdArray.map(() => '?').join(',');
      whereClauses.push(`EXISTS (
        SELECT 1 FROM event_tag_assignments eta
        WHERE eta.event_id = event_id AND eta.tag_id IN (${tagPlaceholders})
      )`);
      params.push(...tagIdArray);
    }

    // Add filter conditions
    if (bar_id) {
      whereClauses.push('bar_id = ?');
      params.push(bar_id);
    }

    if (category) {
      whereClauses.push('category = ?');
      params.push(category);
    }

    if (date_from) {
      whereClauses.push('date >= ?');
      params.push(date_from);
    }

    if (date_to) {
      whereClauses.push('date <= ?');
      params.push(date_to);
    }

    // Only add CURDATE filter if not using upcoming view and upcoming is not explicitly set
    if (upcoming === 'true' && baseView !== 'upcoming_event_instances') {
      whereClauses.push('date >= CURDATE()');
    }

    // Don't show cancelled instances
    whereClauses.push('is_cancelled = false');

    // Construct query
    let selectSql = `SELECT ${selectClauses.join(', ')} FROM ${baseView}`;
    if (whereClauses.length > 0) {
      selectSql += ` WHERE ${whereClauses.join(' AND ')}`;
    }
    selectSql += ` ORDER BY date ASC, start_time ASC`;

    // Add pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;
    selectSql += ` LIMIT ? OFFSET ?`;
    params.push(limitNum, offset);

    const [rows] = await db.query(selectSql, params);

    // Get total count for pagination metadata
    let countSql = `SELECT COUNT(*) as total FROM ${baseView}`;
    if (whereClauses.length > 0) {
      countSql += ` WHERE ${whereClauses.join(' AND ')}`;
    }
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
    console.error('Error fetching event instances:', err.message || err);
    return res.status(500).json({ error: 'Failed to fetch event instances' });
  }
}

/**
 * GET /events/:id
 * Returns a master event with its recurrence information and upcoming instances
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

    // Get upcoming instances (next 10)
    const instancesSql = `
      SELECT id as instance_id, date, is_cancelled, 
             custom_start_time, custom_end_time, custom_description, custom_image_url
      FROM event_instances 
      WHERE event_id = ? AND date >= CURDATE() 
      ORDER BY date ASC 
      LIMIT 10
    `;
    const [instanceRows] = await db.query(instancesSql, [eventId]);
    event.upcoming_instances = instanceRows;

    // Add human-readable recurrence description
    event.recurrence_description = getRecurrenceDescription(event);

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
 * GET /event-instances/:instanceId
 * Returns a specific event instance with full event details
 */
async function getEventInstance(req, res) {
  try {
    const instanceId = req.params.instanceId;

    const selectSql = `
      SELECT 
        ei.id as instance_id,
        ei.event_id,
        ei.date,
        ei.is_cancelled,
        COALESCE(ei.custom_start_time, e.start_time) as start_time,
        COALESCE(ei.custom_end_time, e.end_time) as end_time,
        COALESCE(ei.custom_description, e.description) as description,
        COALESCE(ei.custom_image_url, e.image_url) as image_url,
        e.title,
        e.category,
        e.external_link,
        e.recurrence_pattern,
        b.name as bar_name,
        b.address_street,
        b.address_city, 
        b.address_state,
        b.address_zip,
        b.phone,
        b.website
      FROM event_instances ei
      INNER JOIN events e ON ei.event_id = e.id
      INNER JOIN bars b ON e.bar_id = b.id
      WHERE ei.id = ? AND e.is_active = 1 AND b.is_active = 1
    `;

    const [rows] = await db.query(selectSql, [instanceId]);

    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Event instance not found' });
    }

    const instance = rows[0];

    // Get event tags
    const tagsSql = `
      SELECT et.id, et.name
      FROM event_tags et
      INNER JOIN event_tag_assignments eta ON et.id = eta.tag_id
      WHERE eta.event_id = ?
      ORDER BY et.name
    `;
    const [tagRows] = await db.query(tagsSql, [instance.event_id]);
    instance.tags = tagRows;

    return res.json({ 
      success: true, 
      data: instance
    });
  } catch (err) {
    console.error('Error fetching event instance:', err.message || err);
    return res.status(500).json({ error: 'Failed to fetch event instance' });
  }
}

/**
 * PUT /event-instances/:instanceId
 * Updates a specific event instance (allows customization)
 */
async function updateEventInstance(req, res) {
  try {
    const instanceId = req.params.instanceId;
    const payload = req.body;

    // Check if instance exists
    const checkSql = `
      SELECT ei.id, ei.event_id, e.title 
      FROM event_instances ei
      INNER JOIN events e ON ei.event_id = e.id
      WHERE ei.id = ? AND e.is_active = 1
    `;
    const [checkRows] = await db.execute(checkSql, [instanceId]);

    if (!checkRows || checkRows.length === 0) {
      return res.status(404).json({ error: 'Event instance not found' });
    }

    // Validate time format if provided
    if (payload.custom_start_time || payload.custom_end_time) {
      const timeRegex = /^([01]?\d|2[0-3]):[0-5]\d:[0-5]\d$/;
      if (payload.custom_start_time && !timeRegex.test(payload.custom_start_time)) {
        return res.status(400).json({ 
          error: 'custom_start_time must be in HH:MM:SS format' 
        });
      }
      if (payload.custom_end_time && !timeRegex.test(payload.custom_end_time)) {
        return res.status(400).json({ 
          error: 'custom_end_time must be in HH:MM:SS format' 
        });
      }
    }

    // Update instance
    const updateSql = `
      UPDATE event_instances SET 
        is_cancelled = COALESCE(?, is_cancelled),
        custom_start_time = ?,
        custom_end_time = ?,
        custom_description = ?,
        custom_image_url = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    await db.execute(updateSql, [
      payload.is_cancelled,
      payload.custom_start_time || null,
      payload.custom_end_time || null,
      payload.custom_description || null,
      payload.custom_image_url || null,
      instanceId
    ]);

    return res.json({ 
      success: true, 
      message: 'Event instance updated successfully',
      data: { id: instanceId }
    });
  } catch (err) {
    console.error('Error updating event instance:', err.message || err);
    return res.status(500).json({ error: 'Failed to update event instance' });
  }
}

/**
 * GET /bars/:barId/events
 * Returns all events (masters) for a specific bar
 */
async function getBarEvents(req, res) {
  try {
    const barId = req.params.barId;
    const { include_instances, limit = 50 } = req.query;

    // Check if bar exists and is active
    const barCheckSql = `SELECT id, name FROM bars WHERE id = ? AND is_active = 1`;
    const [barRows] = await db.execute(barCheckSql, [barId]);

    if (!barRows || barRows.length === 0) {
      return res.status(404).json({ error: 'Bar not found' });
    }

    const selectSql = `
      SELECT * FROM events 
      WHERE bar_id = ? AND is_active = 1 
      ORDER BY recurrence_start_date DESC, created_at DESC 
      LIMIT ?
    `;

    const [rows] = await db.query(selectSql, [barId, parseInt(limit)]);

    // Optionally include upcoming instances for each event
    if (include_instances === 'true') {
      for (const event of rows) {
        const instancesSql = `
          SELECT id as instance_id, date, is_cancelled
          FROM event_instances 
          WHERE event_id = ? AND date >= CURDATE() 
          ORDER BY date ASC 
          LIMIT 5
        `;
        const [instanceRows] = await db.query(instancesSql, [event.id]);
        event.upcoming_instances = instanceRows;
        event.recurrence_description = getRecurrenceDescription(event);
      }
    }

    return res.json({
      success: true,
      data: rows,
      meta: {
        bar: {
          id: barRows[0].id,
          name: barRows[0].name
        },
        count: rows.length,
        include_instances: include_instances === 'true'
      }
    });
  } catch (err) {
    console.error('Error fetching bar events:', err.message || err);
    return res.status(500).json({ error: 'Failed to fetch bar events' });
  }
}

/**
 * PUT /events/:id
 * Updates a master event (affects future instances)
 */
async function updateEvent(req, res) {
  try {
    const eventId = req.params.id;
    const payload = req.body;
    const userId = req.user.userId; // From JWT

    // Check if event exists and is active
    const checkSql = `SELECT id, title FROM events WHERE id = ? AND is_active = 1`;
    const [checkRows] = await db.execute(checkSql, [eventId]);

    if (!checkRows || checkRows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Validate category if provided
    if (payload.category) {
      const validCategories = ['live_music', 'trivia', 'happy_hour', 'sports', 'comedy'];
      if (!validCategories.includes(payload.category)) {
        return res.status(400).json({ 
          error: 'Invalid category. Must be one of: ' + validCategories.join(', ') 
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

    // Update event
    const updateSql = `
      UPDATE events SET 
        title = COALESCE(?, title),
        description = COALESCE(?, description),
        start_time = COALESCE(?, start_time),
        end_time = COALESCE(?, end_time),
        category = COALESCE(?, category),
        external_link = ?,
        image_url = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    await db.execute(updateSql, [
      payload.title,
      payload.description,
      payload.start_time,
      payload.end_time,
      payload.category,
      payload.external_link || null,
      payload.image_url || null,
      eventId
    ]);

    return res.json({ 
      success: true, 
      message: 'Event updated successfully',
      data: { id: eventId }
    });
  } catch (err) {
    console.error('Error updating event:', err.message || err);
    return res.status(500).json({ error: 'Failed to update event' });
  }
}

/**
 * DELETE /events/:id
 * Soft deletes an event (sets is_active = false)
 */
async function deleteEvent(req, res) {
  try {
    const eventId = req.params.id;
    const userId = req.user.userId; // From JWT

    // Check if event exists and is active
    const checkSql = `SELECT id, title FROM events WHERE id = ? AND is_active = 1`;
    const [checkRows] = await db.execute(checkSql, [eventId]);

    if (!checkRows || checkRows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Soft delete the event
    const deleteSql = `UPDATE events SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
    await db.execute(deleteSql, [eventId]);

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

module.exports = {
  createEvent,
  getEventInstances,
  getEvent,
  getEventInstance,
  updateEventInstance,
  getBarEvents,
  updateEvent,
  deleteEvent,
  
  // Legacy function names for backward compatibility (redirect to new functions)
  getAllEvents: getEventInstances
};