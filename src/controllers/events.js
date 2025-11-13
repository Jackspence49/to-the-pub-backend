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
 *   event_tag_id: 'uuid', // event tag UUID from event_tags table
 *   external_link: 'string', // optional
 *   recurrence_pattern: 'none|daily|weekly|monthly', // default: 'none'
 *   recurrence_days: [0,1,2,3,4,5,6], // array of day numbers, required for weekly only
 *   recurrence_start_date: 'YYYY-MM-DD', // required for recurring events, or single event date
 *   recurrence_end_date: 'YYYY-MM-DD' // required for recurring events
 * }
 */
async function createEvent(req, res) {
  const payload = req.body;

  // Basic validation
  if (!payload || !payload.bar_id || !payload.title || 
      !payload.start_time || !payload.end_time || !payload.event_tag_id) {
    return res.status(400).json({ 
      error: 'Missing required fields: bar_id, title, start_time, end_time, event_tag_id' 
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

  // Validate tag exists
  const tagCheckSql = `SELECT id, name FROM event_tags WHERE id = ?`;
  const [tagRows] = await db.execute(tagCheckSql, [payload.event_tag_id]);
  
  if (!tagRows || tagRows.length === 0) {
    return res.status(400).json({ 
      error: 'Invalid event_tag_id. Event tag not found.' 
    });
  }

  // Validate time format (HH:MM:SS)
  const timeRegex = /^([01]?\d|2[0-3]):[0-5]\d:[0-5]\d$/;
  if (!timeRegex.test(payload.start_time) || !timeRegex.test(payload.end_time)) {
    return res.status(400).json({ 
      error: 'Time must be in HH:MM:SS format' 
    });
  }

  // Calculate if event crosses midnight
  let crossesMidnight = false;
  if (payload.start_time && payload.end_time) {
    // Convert time strings to comparable format (HH:MM:SS)
    const startTime = payload.start_time.split(':').map(Number);
    const endTime = payload.end_time.split(':').map(Number);
    
    // Compare hours, then minutes if hours are equal
    if (endTime[0] < startTime[0] || 
        (endTime[0] === startTime[0] && endTime[1] < startTime[1])) {
      crossesMidnight = true;
    }
  }
  
  // If not crossing midnight, validate that end_time is after start_time
  if (!crossesMidnight && payload.start_time >= payload.end_time) {
    return res.status(400).json({ 
      error: 'End time must be after start time (unless event crosses midnight)' 
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
  const startDate = new Date(payload.recurrence_start_date + 'T00:00:00');
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
        id, bar_id, title, description, start_time, end_time, crosses_midnight,
        image_url, event_tag_id, external_link, recurrence_pattern, 
        recurrence_days, recurrence_start_date, recurrence_end_date, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const eventParams = [
      eventId,
      payload.bar_id,
      payload.title,
      payload.description || null,
      payload.start_time,
      payload.end_time,
      crossesMidnight ? 1 : 0,
      payload.image_url || null,
      payload.event_tag_id,
      payload.external_link || null,
      recurrencePattern,
      recurrencePattern !== 'none' ? JSON.stringify(payload.recurrence_days || []) : null,
      payload.recurrence_start_date,
      payload.recurrence_end_date || payload.recurrence_start_date,
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
        INSERT INTO event_instances (id, event_id, date, crosses_midnight) 
        VALUES (?, ?, ?, ?)
      `;
      
      for (const instance of instances) {
        const instanceId = uuidv4();
        // Event instances inherit crosses_midnight from master event by default
        await conn.execute(insertInstanceSql, [instanceId, instance.event_id, instance.date, crossesMidnight ? 1 : 0]);
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
 * GET /events/instances?bar_id=uuid&event_tag_id=uuid&date_from=2024-01-01&date_to=2024-12-31&upcoming=true&page=1&limit=20
 * Returns event instances with optional filtering
 * This replaces the old getAllEvents function to work with the new schema
 */
async function getEventInstances(req, res) {
  try {
    const { 
      bar_id, 
      date_from, 
      date_to, 
      upcoming, 
      event_tag_id,
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

    // Build dynamic query using direct joins instead of views to ensure all fields are included
    let selectClauses = [
      'ei.id as instance_id',
      'ei.event_id', 
      'ei.date',
      'ei.is_cancelled',
      'COALESCE(ei.custom_start_time, e.start_time) as start_time',
      'COALESCE(ei.custom_end_time, e.end_time) as end_time',
      'COALESCE(ei.crosses_midnight, e.crosses_midnight) as crosses_midnight',
      'COALESCE(ei.custom_description, e.description) as description',
      'COALESCE(ei.custom_image_url, e.image_url) as image_url',
      'e.title',
      'e.external_link',
      'e.event_tag_id',
      'e.bar_id',
      'b.name as bar_name',
      'b.address_street',
      'b.address_city',
      'b.address_state',
      'b.address_zip',
      'b.phone',
      'b.website'
    ];
    
    let fromClause = `
      FROM event_instances ei
      INNER JOIN events e ON ei.event_id = e.id
      INNER JOIN bars b ON e.bar_id = b.id
      WHERE e.is_active = 1 AND b.is_active = 1
    `;
    
    let whereClauses = [];
    let params = [];

    // Simplify tag filtering to single event_tag_id
    if (event_tag_id) {
      whereClauses.push('e.event_tag_id = ?');
      params.push(event_tag_id);
    }

    // Add filter conditions
    if (bar_id) {
      whereClauses.push('e.bar_id = ?');
      params.push(bar_id);
    }

    if (date_from) {
      whereClauses.push('ei.date >= ?');
      params.push(date_from);
    }

    if (date_to) {
      whereClauses.push('ei.date <= ?');
      params.push(date_to);
    }

    // Add upcoming filter
    if (upcoming === 'true') {
      whereClauses.push('ei.date >= CURDATE()');
    }

    // Don't show cancelled instances
    whereClauses.push('ei.is_cancelled = false');

    // Construct query
    let selectSql = `SELECT ${selectClauses.join(', ')} ${fromClause}`;
    if (whereClauses.length > 0) {
      selectSql += ` AND ${whereClauses.join(' AND ')}`;
    }
    selectSql += ` ORDER BY ei.date ASC, start_time ASC`;

    // Add pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;
    selectSql += ` LIMIT ? OFFSET ?`;
    params.push(limitNum, offset);

    const [rows] = await db.query(selectSql, params);

    // Get total count for pagination metadata
    let countSql = `SELECT COUNT(*) as total ${fromClause}`;
    if (whereClauses.length > 0) {
      countSql += ` AND ${whereClauses.join(' AND ')}`;
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
          date_from, 
          date_to, 
          upcoming,
          event_tag_id
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
        b.website,
        et.id as tag_id,
        et.name as tag_name
      FROM events e
      INNER JOIN bars b ON e.bar_id = b.id
      LEFT JOIN event_tags et ON e.event_tag_id = et.id
      WHERE e.id = ? AND e.is_active = 1 AND b.is_active = 1
    `;

    const [rows] = await db.query(selectSql, [eventId]);

    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const event = rows[0];

    // Set tag information
    event.tag = event.tag_id ? {
      id: event.tag_id,
      name: event.tag_name
    } : null;
    
    // Clean up the flattened tag fields but keep event_tag_id in the main object
    delete event.tag_id;
    delete event.tag_name;

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
        e.external_link,
        et.id as tag_id,
        et.name as tag_name,
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
      LEFT JOIN event_tags et ON e.event_tag_id = et.id
      WHERE ei.id = ? AND e.is_active = 1 AND b.is_active = 1
    `;

    const [rows] = await db.query(selectSql, [instanceId]);

    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Event instance not found' });
    }

    const instance = rows[0];

    // Set tag information
    instance.tag = instance.tag_id ? {
      id: instance.tag_id,
      name: instance.tag_name
    } : null;
    
    // Clean up the flattened tag fields
    delete instance.tag_id;
    delete instance.tag_name;

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
      
      // If both custom times provided, validate they make sense (allow midnight crossing)
      if (payload.custom_start_time && payload.custom_end_time) {
        const startTime = payload.custom_start_time.split(':').map(Number);
        const endTime = payload.custom_end_time.split(':').map(Number);
        
        const crossesMidnight = endTime[0] < startTime[0] || 
                               (endTime[0] === startTime[0] && endTime[1] < startTime[1]);
        
        // Just log that this is a midnight-crossing event, don't prevent it
        if (crossesMidnight) {
          console.log(`Event instance ${instanceId} has custom times that cross midnight: ${payload.custom_start_time} - ${payload.custom_end_time}`);
        }
      }
    }

    // Calculate crosses_midnight for this instance
    let instanceCrossesMidnight = null;
    
    if (payload.custom_start_time && payload.custom_end_time) {
      // Both custom times provided - calculate based on custom times
      const startTime = payload.custom_start_time.split(':').map(Number);
      const endTime = payload.custom_end_time.split(':').map(Number);
      instanceCrossesMidnight = endTime[0] < startTime[0] || 
                               (endTime[0] === startTime[0] && endTime[1] < startTime[1]);
    } else if (payload.custom_start_time || payload.custom_end_time) {
      // Only one custom time provided - need to get the other from master event
      const [masterEventRows] = await db.execute(
        'SELECT start_time, end_time, crosses_midnight FROM events WHERE id = (SELECT event_id FROM event_instances WHERE id = ?)',
        [instanceId]
      );
      
      if (masterEventRows.length > 0) {
        const masterEvent = masterEventRows[0];
        const startTime = (payload.custom_start_time || masterEvent.start_time).split(':').map(Number);
        const endTime = (payload.custom_end_time || masterEvent.end_time).split(':').map(Number);
        instanceCrossesMidnight = endTime[0] < startTime[0] || 
                                 (endTime[0] === startTime[0] && endTime[1] < startTime[1]);
      }
    }
    // If no custom times provided, crosses_midnight will remain unchanged (inherited from master event)

    // Update instance
    const updateSql = `
      UPDATE event_instances SET 
        is_cancelled = COALESCE(?, is_cancelled),
        custom_start_time = ?,
        custom_end_time = ?,
        custom_description = ?,
        custom_image_url = ?,
        crosses_midnight = COALESCE(?, crosses_midnight),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    await db.execute(updateSql, [
      payload.is_cancelled,
      payload.custom_start_time || null,
      payload.custom_end_time || null,
      payload.custom_description || null,
      payload.custom_image_url || null,
      instanceCrossesMidnight,
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

    // Validate tag exists if provided
    if (payload.event_tag_id) {
      const tagCheckSql = `SELECT id, name FROM event_tags WHERE id = ?`;
      const [tagRows] = await db.execute(tagCheckSql, [payload.event_tag_id]);
      
      if (!tagRows || tagRows.length === 0) {
        return res.status(400).json({ 
          error: 'Invalid event_tag_id. Event tag not found.' 
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
    
    // If both times provided, calculate crosses_midnight
    let crossesMidnight = null;
    if (payload.start_time && payload.end_time) {
      const startTime = payload.start_time.split(':').map(Number);
      const endTime = payload.end_time.split(':').map(Number);
      
      if (endTime[0] < startTime[0] || 
          (endTime[0] === startTime[0] && endTime[1] < startTime[1])) {
        crossesMidnight = true;
      } else {
        crossesMidnight = false;
      }
    }

    // Update event
    const updateSql = `
      UPDATE events SET 
        title = COALESCE(?, title),
        description = COALESCE(?, description),
        start_time = COALESCE(?, start_time),
        end_time = COALESCE(?, end_time),
        crosses_midnight = COALESCE(?, crosses_midnight),
        event_tag_id = COALESCE(?, event_tag_id),
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
      crossesMidnight,
      payload.event_tag_id,
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