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
 *   start_date: 'YYYY-MM-DD', // required for recurring events, or single event date
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

  // Validate recurrence_pattern
  const validPatterns = ['none', 'daily', 'weekly', 'monthly', 'yearly'];
  if (!validPatterns.includes(recurrencePattern)) {
    return res.status(400).json({
      error: `recurrence_pattern must be one of: ${validPatterns.join(', ')}`
    });
  }

  // For non-recurring events, require start_date as the event date
  if (recurrencePattern === 'none' && !payload.start_date) {
    return res.status(400).json({ 
      error: 'start_date is required (use as event date for one-time events)' 
    });
  }

  // For recurring events (including yearly), require start date and either end date or occurrence count
  if (recurrencePattern !== 'none') {
    if (!payload.start_date || (!payload.recurrence_end_date && !payload.recurrence_end_occurrences)) {
      return res.status(400).json({
        error: 'start_date and either recurrence_end_date or recurrence_end_occurrences are required for recurring events (including yearly)'
      });
    }
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
    start_date: payload.start_date,
    recurrence_end_date: payload.recurrence_end_date,
    recurrence_end_occurrences: payload.recurrence_end_occurrences
  };

  const validation = validateRecurrenceData(recurrenceData);
  if (!validation.isValid) {
    return res.status(400).json({ 
      error: 'Recurrence validation failed',
      details: validation.errors 
    });
  }

  // Validate that start date is not in the past
  const startDate = new Date(payload.start_date + 'T00:00:00');
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
        recurrence_days, start_date, recurrence_end_date, recurrence_end_occurrences, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      payload.start_date,
      payload.recurrence_end_date || payload.start_date,
      payload.recurrence_end_occurrences ?? null,
      1
    ];
    
    await conn.execute(insertEventSql, eventParams);

    // Generate and insert event instances
    const eventForGeneration = {
      id: eventId,
      recurrence_pattern: recurrencePattern,
      recurrence_days: payload.recurrence_days,
      start_date: payload.start_date,
      recurrence_end_date: payload.recurrence_end_date || payload.start_date,
      recurrence_end_occurrences: payload.recurrence_end_occurrences
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
 * GET /events/instances?bar_id=uuid&event_tag_id=uuid&date_from=2024-01-01&date_to=2024-12-31&upcoming=true&lat=40.71&lon=-74.0&radius=5&unit=miles&page=1&limit=20
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
      lat,
      lon,
      radius,
      unit,
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

    // Validate and normalize location parameters (shared logic with /bars)
    let userLat = null;
    let userLon = null;
    let radiusValue = null;
    let distanceUnit = 'km';

    if (lat !== undefined || lon !== undefined) {
      if (lat === undefined || lon === undefined) {
        return res.status(400).json({ error: 'Both lat and lon are required when using location-based filtering.' });
      }

      userLat = parseFloat(lat);
      userLon = parseFloat(lon);

      if (
        Number.isNaN(userLat) ||
        Number.isNaN(userLon) ||
        userLat < -90 || userLat > 90 ||
        userLon < -180 || userLon > 180
      ) {
        return res.status(400).json({ error: 'Invalid latitude or longitude. Latitude must be between -90 and 90, longitude between -180 and 180.' });
      }

      if (radius !== undefined) {
        radiusValue = parseFloat(radius);
        if (Number.isNaN(radiusValue) || radiusValue <= 0) {
          return res.status(400).json({ error: 'Radius must be a positive number.' });
        }
      }

      if (unit !== undefined) {
        const normalizedUnit = unit.toLowerCase();
        if (normalizedUnit !== 'km' && normalizedUnit !== 'miles') {
          return res.status(400).json({ error: 'Unit must be either "km" or "miles".' });
        }
        distanceUnit = normalizedUnit;
      }
    } else if (radius !== undefined || unit !== undefined) {
      return res.status(400).json({ error: 'Radius and unit parameters require both lat and lon to be provided.' });
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
      'COALESCE(ei.custom_title, e.title) as title',
      'COALESCE(ei.custom_external_link, e.external_link) as external_link',
      'COALESCE(ei.custom_event_tag_id, e.event_tag_id) as event_tag_id',
      'COALESCE(ct.name, et.name) as event_tag_name',
      'e.bar_id',
      'b.name as bar_name',
      'b.address_street',
      'b.address_city',
      'b.address_state',
      'b.address_zip',
      'b.phone',
      'b.website',
      'b.latitude',
      'b.longitude'
    ];

    const effectiveStartTimeExpr = 'COALESCE(ei.custom_start_time, e.start_time)';
    const effectiveEndTimeExpr = 'COALESCE(ei.custom_end_time, e.end_time)';
    const effectiveCrossesMidnightExpr = 'COALESCE(ei.crosses_midnight, e.crosses_midnight)';
    const upcomingPredicate = `(
      ei.date > CURDATE() OR 
      (
        ei.date = CURDATE() AND (
          ${effectiveStartTimeExpr} >= CURTIME() OR 
          ${effectiveEndTimeExpr} > CURTIME() OR 
          (${effectiveCrossesMidnightExpr} = 1 AND ${effectiveStartTimeExpr} <= CURTIME())
        )
      )
    )`;
    const inProgressPredicate = `(
      ei.date = CURDATE() AND 
      ${effectiveStartTimeExpr} <= CURTIME() AND (
        ${effectiveEndTimeExpr} > CURTIME() OR 
        (${effectiveCrossesMidnightExpr} = 1 AND ${effectiveStartTimeExpr} <= CURTIME())
      )
    )`;
    let selectParams = [];
    
    let fromClause = `
      FROM event_instances ei
      INNER JOIN events e ON ei.event_id = e.id
      INNER JOIN bars b ON e.bar_id = b.id
      LEFT JOIN event_tags et ON e.event_tag_id = et.id
      LEFT JOIN event_tags ct ON ei.custom_event_tag_id = ct.id
      WHERE e.is_active = 1 AND b.is_active = 1
    `;
    
    let whereClauses = [];
    let whereParams = [];

    if (userLat !== null && userLon !== null) {
      const earthRadius = distanceUnit === 'miles' ? 3959 : 6371;
      selectClauses.push(`ROUND((
        ${earthRadius} * acos(
          cos(radians(?)) * cos(radians(b.latitude)) * 
          cos(radians(b.longitude) - radians(?)) + 
          sin(radians(?)) * sin(radians(b.latitude))
        )
      ), 2) as distance_${distanceUnit}`);
      selectParams.push(userLat, userLon, userLat);

      // Exclude bars that lack coordinates when sorting/filtering by distance
      whereClauses.push('b.latitude IS NOT NULL AND b.longitude IS NOT NULL');

      if (radiusValue !== null) {
        whereClauses.push(`(
          ${earthRadius} * acos(
            cos(radians(?)) * cos(radians(b.latitude)) * 
            cos(radians(b.longitude) - radians(?)) + 
            sin(radians(?)) * sin(radians(b.latitude))
          )
        ) <= ?`);
        whereParams.push(userLat, userLon, userLat, radiusValue);
      }
    }

    // Simplify tag filtering to single event_tag_id
    if (event_tag_id) {
      whereClauses.push('COALESCE(ei.custom_event_tag_id, e.event_tag_id) = ?');
      whereParams.push(event_tag_id);
    }

    // Add filter conditions
    if (bar_id) {
      whereClauses.push('e.bar_id = ?');
      whereParams.push(bar_id);
    }

    if (date_from) {
      whereClauses.push('ei.date >= ?');
      whereParams.push(date_from);
    }

    if (date_to) {
      whereClauses.push('ei.date <= ?');
      whereParams.push(date_to);
    }

    // Add upcoming filter
    if (upcoming === 'true') {
      whereClauses.push(upcomingPredicate);
    }

    // Don't show cancelled instances
    whereClauses.push('ei.is_cancelled = false');

    const whereSql = whereClauses.length > 0 ? ` AND ${whereClauses.join(' AND ')}` : '';

    // Construct query
    let selectSql = `SELECT ${selectClauses.join(', ')} ${fromClause}${whereSql}`;
    if (userLat !== null && userLon !== null) {
      selectSql += ` ORDER BY 
        ei.date ASC,
        CASE WHEN ${inProgressPredicate} THEN 0 ELSE 1 END ASC,
        CASE WHEN ${inProgressPredicate} THEN distance_${distanceUnit} ELSE NULL END ASC,
        ${effectiveStartTimeExpr} ASC,
        distance_${distanceUnit} ASC`;
    } else {
      selectSql += ` ORDER BY ei.date ASC, ${effectiveStartTimeExpr} ASC`;
    }

    // Add pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;
    selectSql += ` LIMIT ? OFFSET ?`;
    const selectQueryParams = [...selectParams, ...whereParams, limitNum, offset];
    const [rows] = await db.query(selectSql, selectQueryParams);

    // Get total count for pagination metadata
    const countSql = `SELECT COUNT(*) as total ${fromClause}${whereSql}`;
    const countParams = [...whereParams];
    const [countRows] = await db.query(countSql, countParams);
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
          event_tag_id,
          radius: radiusValue,
          unit: userLat !== null ? distanceUnit : null
        },
        location: userLat !== null && userLon !== null ? {
          lat: userLat,
          lon: userLon,
          sorted_by_distance: true,
          unit: distanceUnit
        } : null
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
    const upcomingInstancesPredicate = `(
      ei.date > CURDATE() OR 
      (
        ei.date = CURDATE() AND (
          COALESCE(ei.custom_start_time, e.start_time) >= CURTIME() OR 
          COALESCE(ei.custom_end_time, e.end_time) > CURTIME() OR 
          (COALESCE(ei.crosses_midnight, e.crosses_midnight) = 1 AND COALESCE(ei.custom_start_time, e.start_time) <= CURTIME())
        )
      )
    )`;

    const instancesSql = `
      SELECT 
        ei.id as instance_id,
        ei.date,
        ei.is_cancelled,
        ei.custom_start_time,
        ei.custom_end_time,
        ei.custom_description,
        ei.custom_image_url,
        ei.custom_title,
        ei.custom_event_tag_id,
        ei.custom_external_link
      FROM event_instances ei
      INNER JOIN events e ON ei.event_id = e.id
      WHERE ei.event_id = ?
        AND ${upcomingInstancesPredicate}
      ORDER BY ei.date ASC, COALESCE(ei.custom_start_time, e.start_time) ASC
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
        e.bar_id as bar_id,
        ei.date,
        ei.is_cancelled,
        COALESCE(ei.custom_start_time, e.start_time) as start_time,
        COALESCE(ei.custom_end_time, e.end_time) as end_time,
        COALESCE(ei.custom_description, e.description) as description,
        COALESCE(ei.custom_image_url, e.image_url) as image_url,
        COALESCE(ei.custom_title, e.title) as title,
        COALESCE(ei.custom_external_link, e.external_link) as external_link,
        COALESCE(ei.custom_event_tag_id, e.event_tag_id) as tag_id,
        COALESCE(ct.name, et.name) as tag_name,
        ei.custom_start_time,
        ei.custom_end_time,
        ei.custom_description,
        ei.custom_image_url,
        ei.custom_title,
        ei.custom_event_tag_id,
        ei.custom_external_link,
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
      LEFT JOIN event_tags ct ON ei.custom_event_tag_id = ct.id
      WHERE ei.id = ? AND e.is_active = 1 AND b.is_active = 1
    `;

    const [rows] = await db.query(selectSql, [instanceId]);

    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Event instance not found' });
    }

    const instance = rows[0];

    // Set tag information (include tag name)
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

    // Check if instance exists and gather current values
    const checkSql = `
      SELECT 
        ei.id, 
        ei.event_id, 
        ei.custom_start_time, 
        ei.custom_end_time,
        e.start_time as master_start_time,
        e.end_time as master_end_time
      FROM event_instances ei
      INNER JOIN events e ON ei.event_id = e.id
      WHERE ei.id = ? AND e.is_active = 1
    `;
    const [checkRows] = await db.execute(checkSql, [instanceId]);

    if (!checkRows || checkRows.length === 0) {
      return res.status(404).json({ error: 'Event instance not found' });
    }

    const instanceMeta = checkRows[0];
    const updates = [];
    const params = [];
    const appendUpdate = (clause, value) => {
      updates.push(clause);
      params.push(value);
    };

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (payload.date !== undefined) {
      if (!payload.date || !dateRegex.test(payload.date)) {
        return res.status(400).json({ error: 'date must be provided in YYYY-MM-DD format' });
      }
      appendUpdate('date = ?', payload.date);
    }

    if (payload.is_cancelled !== undefined) {
      let boolValue;
      if (typeof payload.is_cancelled === 'string') {
        const lowered = payload.is_cancelled.toLowerCase();
        if (lowered === 'true') {
          boolValue = true;
        } else if (lowered === 'false') {
          boolValue = false;
        } else {
          return res.status(400).json({ error: 'is_cancelled must be a boolean value' });
        }
      } else {
        boolValue = payload.is_cancelled === true || payload.is_cancelled === 1;
      }
      appendUpdate('is_cancelled = ?', boolValue ? 1 : 0);
    }

    const timeRegex = /^([01]?\d|2[0-3]):[0-5]\d:[0-5]\d$/;
    let normalizedCustomStartTime;
    let normalizedCustomEndTime;

    if (payload.custom_start_time !== undefined) {
      if (!payload.custom_start_time) {
        normalizedCustomStartTime = null;
      } else {
        if (!timeRegex.test(payload.custom_start_time)) {
          return res.status(400).json({ error: 'custom_start_time must be in HH:MM:SS format' });
        }
        normalizedCustomStartTime = payload.custom_start_time;
      }
      appendUpdate('custom_start_time = ?', normalizedCustomStartTime);
    }

    if (payload.custom_end_time !== undefined) {
      if (!payload.custom_end_time) {
        normalizedCustomEndTime = null;
      } else {
        if (!timeRegex.test(payload.custom_end_time)) {
          return res.status(400).json({ error: 'custom_end_time must be in HH:MM:SS format' });
        }
        normalizedCustomEndTime = payload.custom_end_time;
      }
      appendUpdate('custom_end_time = ?', normalizedCustomEndTime);
    }

    const normalizeEmptyToNull = (value) => {
      if (value === undefined) {
        return undefined;
      }
      if (value === null || value === '') {
        return null;
      }
      return value;
    };

    const normalizedDescription = normalizeEmptyToNull(payload.custom_description);
    if (payload.custom_description !== undefined) {
      appendUpdate('custom_description = ?', normalizedDescription);
    }

    const normalizedImageUrl = normalizeEmptyToNull(payload.custom_image_url);
    if (payload.custom_image_url !== undefined) {
      appendUpdate('custom_image_url = ?', normalizedImageUrl);
    }

    const normalizeTrimmed = (value, maxLength, fieldName) => {
      if (value === undefined) {
        return undefined;
      }
      if (value === null || value === '') {
        return null;
      }
      if (typeof value !== 'string') {
        throw new Error(`${fieldName} must be a string`);
      }
      const trimmed = value.trim();
      if (trimmed.length === 0) {
        return null;
      }
      if (trimmed.length > maxLength) {
        throw new Error(`${fieldName} must be ${maxLength} characters or fewer`);
      }
      return trimmed;
    };

    try {
      const normalizedTitle = normalizeTrimmed(payload.custom_title, 255, 'custom_title');
      if (normalizedTitle !== undefined) {
        appendUpdate('custom_title = ?', normalizedTitle);
      }
    } catch (validationErr) {
      return res.status(400).json({ error: validationErr.message });
    }

    try {
      const normalizedExternalLink = normalizeTrimmed(payload.custom_external_link, 500, 'custom_external_link');
      if (normalizedExternalLink !== undefined) {
        appendUpdate('custom_external_link = ?', normalizedExternalLink);
      }
    } catch (validationErr) {
      return res.status(400).json({ error: validationErr.message });
    }

    let sanitizedCustomEventTagId;
    if (payload.custom_event_tag_id !== undefined) {
      if (!payload.custom_event_tag_id) {
        sanitizedCustomEventTagId = null;
      } else {
        const tagCheckSql = 'SELECT id FROM event_tags WHERE id = ?';
        const [tagRows] = await db.execute(tagCheckSql, [payload.custom_event_tag_id]);
        if (!tagRows || tagRows.length === 0) {
          return res.status(400).json({ error: 'custom_event_tag_id does not reference an existing event tag' });
        }
        sanitizedCustomEventTagId = payload.custom_event_tag_id;
      }
      appendUpdate('custom_event_tag_id = ?', sanitizedCustomEventTagId);
    }

    // Determine if we need to recalculate crosses_midnight
    const startProvided = payload.custom_start_time !== undefined;
    const endProvided = payload.custom_end_time !== undefined;
    let instanceCrossesMidnight = null;

    if (startProvided || endProvided) {
      const effectiveCustomStart = startProvided ? normalizedCustomStartTime : instanceMeta.custom_start_time;
      const effectiveCustomEnd = endProvided ? normalizedCustomEndTime : instanceMeta.custom_end_time;
      const startTime = (effectiveCustomStart || instanceMeta.master_start_time).split(':').map(Number);
      const endTime = (effectiveCustomEnd || instanceMeta.master_end_time).split(':').map(Number);
      instanceCrossesMidnight = endTime[0] < startTime[0] || 
                               (endTime[0] === startTime[0] && endTime[1] < startTime[1]);
      appendUpdate('crosses_midnight = ?', instanceCrossesMidnight ? 1 : 0);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updatable fields were provided' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    const updateSql = `UPDATE event_instances SET ${updates.join(', ')} WHERE id = ?`;
    params.push(instanceId);

    try {
      await db.execute(updateSql, params);
    } catch (err) {
      if (err && err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'Another instance already exists on that date for this event' });
      }
      throw err;
    }

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
 * PUT /events/:id
 * Updates a master event (affects future instances)
 * Now supports updating dates and recurrence patterns with automatic instance regeneration
 */
async function updateEvent(req, res) {
  try {
    const eventId = req.params.id;
    const payload = req.body;
    const userId = req.user.userId; // From JWT

    // Check if event exists and is active, and get current values
    const checkSql = `
      SELECT id, title, description, event_tag_id, external_link, image_url,
             recurrence_pattern, recurrence_days, start_date, recurrence_end_date,
             recurrence_end_occurrences, start_time, end_time, crosses_midnight,
             is_active
      FROM events WHERE id = ?
    `;
    const [checkRows] = await db.execute(checkSql, [eventId]);

    if (!checkRows || checkRows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const currentEvent = checkRows[0];

    const normalizeDateValue = (value) => {
      if (!value) {
        return null;
      }
      if (typeof value === 'string') {
        if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
          return value;
        }
        const parsed = new Date(value);
        return isNaN(parsed) ? value : parsed.toISOString().split('T')[0];
      }
      if (value instanceof Date || typeof value === 'number') {
        const parsed = value instanceof Date ? value : new Date(value);
        return isNaN(parsed) ? null : parsed.toISOString().split('T')[0];
      }
      return null;
    };

    const currentStartDate = normalizeDateValue(currentEvent.start_date);
    const currentRecurrenceEndDate = normalizeDateValue(currentEvent.recurrence_end_date);

    const sanitizedExternalLink = payload.external_link !== undefined
      ? (payload.external_link || null)
      : currentEvent.external_link;

    const sanitizedImageUrl = payload.image_url !== undefined
      ? (payload.image_url || null)
      : currentEvent.image_url;

    const serializedRecurrenceDays = payload.recurrence_days !== undefined
      ? (payload.recurrence_days ? JSON.stringify(payload.recurrence_days) : null)
      : currentEvent.recurrence_days;

    const nextRecurrenceEndOccurrences = payload.recurrence_end_occurrences !== undefined
      ? payload.recurrence_end_occurrences
      : currentEvent.recurrence_end_occurrences;

    const newIsActiveValue = payload.cancel_all_instances === true
      ? 0
      : payload.cancel_all_instances === false
        ? 1
        : null;

    const shouldResetStartTimes = payload.start_time !== undefined;
    const shouldResetEndTimes = payload.end_time !== undefined;
    const shouldResetDescriptions = payload.description !== undefined;
    const shouldResetImages = payload.image_url !== undefined;
    const shouldResetTitles = payload.title !== undefined;
    const shouldResetExternalLinks = payload.external_link !== undefined;
    

    const forceRegenerate = payload.regenerate_instances === true;

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

    // Validate date formats only if present in payload
    if (payload.start_date) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(payload.start_date)) {
        return res.status(400).json({ 
          error: 'start_date must be in YYYY-MM-DD format' 
        });
      }
    }
    if (payload.recurrence_end_date) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(payload.recurrence_end_date)) {
        return res.status(400).json({ 
          error: 'recurrence_end_date must be in YYYY-MM-DD format' 
        });
      }
    }

    // Validate that start date is not in the past if being updated
    if (payload.start_date) {
      const startDate = new Date(payload.start_date + 'T00:00:00');
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (startDate < today) {
        return res.status(400).json({ 
          error: 'Event start date cannot be in the past' 
        });
      }
    }


    // Only validate recurrence data and regenerate instances if recurrence-related fields are present
    const recurrenceFields = [
      'recurrence_pattern',
      'recurrence_days',
      'start_date',
      'recurrence_end_date',
      'recurrence_end_occurrences'
    ];
    const recurrenceChanged = recurrenceFields.some(field => payload[field] !== undefined);
    let shouldRegenerate = false;
    let updatedRecurrenceData = null;
    // Only run recurrence validation if recurrence fields are being changed or forceRegenerate is true
    if ((recurrenceChanged || forceRegenerate) && (payload.start_date !== undefined || payload.recurrence_pattern !== undefined || payload.recurrence_days !== undefined || payload.recurrence_end_date !== undefined || payload.recurrence_end_occurrences !== undefined)) {
      updatedRecurrenceData = {
        recurrence_pattern: payload.recurrence_pattern || currentEvent.recurrence_pattern,
        recurrence_days: payload.recurrence_days !== undefined ? payload.recurrence_days : 
                        (currentEvent.recurrence_days ? JSON.parse(currentEvent.recurrence_days) : null),
        start_date: payload.start_date || currentStartDate,
        recurrence_end_date: payload.recurrence_end_date || currentRecurrenceEndDate,
        recurrence_end_occurrences: nextRecurrenceEndOccurrences
      };
      const validation = validateRecurrenceData(updatedRecurrenceData, {
        requireStartDate: payload.start_date !== undefined || !currentStartDate
      });
      if (!validation.isValid) {
        return res.status(400).json({ 
          error: 'Recurrence validation failed',
          details: validation.errors 
        });
      }
      shouldRegenerate = true;
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
    } else if (payload.start_time || payload.end_time) {
      // Only one time provided - need to calculate with the other existing time
      const startTime = (payload.start_time || currentEvent.start_time).split(':').map(Number);
      const endTime = (payload.end_time || currentEvent.end_time).split(':').map(Number);
      
      if (endTime[0] < startTime[0] || 
          (endTime[0] === startTime[0] && endTime[1] < startTime[1])) {
        crossesMidnight = true;
      } else {
        crossesMidnight = false;
      }
    }

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().split('T')[0];

      // Update the master event
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
          recurrence_pattern = COALESCE(?, recurrence_pattern),
          recurrence_days = ?,
          start_date = COALESCE(?, start_date),
          recurrence_end_date = COALESCE(?, recurrence_end_date),
          recurrence_end_occurrences = ?,
          is_active = COALESCE(?, is_active),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;

      await conn.execute(updateSql, [
        payload.title || null,
        payload.description || null,
        payload.start_time || null,
        payload.end_time || null,
        crossesMidnight,
        payload.event_tag_id || null,
        sanitizedExternalLink,
        sanitizedImageUrl,
        payload.recurrence_pattern || null,
        serializedRecurrenceDays,
        payload.start_date || null,
        payload.recurrence_end_date || null,
        nextRecurrenceEndOccurrences,
        newIsActiveValue,
        eventId
      ]);

      if (shouldResetStartTimes) {
        await conn.execute(
          `UPDATE event_instances SET custom_start_time = NULL, updated_at = CURRENT_TIMESTAMP 
           WHERE event_id = ? AND date >= ?`,
          [eventId, todayStr]
        );
      }

      if (shouldResetEndTimes) {
        await conn.execute(
          `UPDATE event_instances SET custom_end_time = NULL, updated_at = CURRENT_TIMESTAMP 
           WHERE event_id = ? AND date >= ?`,
          [eventId, todayStr]
        );
      }

      if (shouldResetDescriptions) {
        await conn.execute(
          `UPDATE event_instances SET custom_description = NULL, updated_at = CURRENT_TIMESTAMP 
           WHERE event_id = ? AND date >= ?`,
          [eventId, todayStr]
        );
      }

      if (shouldResetImages) {
        await conn.execute(
          `UPDATE event_instances SET custom_image_url = NULL, updated_at = CURRENT_TIMESTAMP 
           WHERE event_id = ? AND date >= ?`,
          [eventId, todayStr]
        );
      }

      if (shouldResetTitles) {
        await conn.execute(
          `UPDATE event_instances SET custom_title = NULL, updated_at = CURRENT_TIMESTAMP 
           WHERE event_id = ? AND date >= ?`,
          [eventId, todayStr]
        );
      }

      if (shouldResetExternalLinks) {
        await conn.execute(
          `UPDATE event_instances SET custom_external_link = NULL, updated_at = CURRENT_TIMESTAMP 
           WHERE event_id = ? AND date >= ?`,
          [eventId, todayStr]
        );
      }

      if (payload.cancel_all_instances === true) {
        await conn.execute(
          `UPDATE event_instances SET is_cancelled = true, updated_at = CURRENT_TIMESTAMP 
           WHERE event_id = ? AND date >= ?`,
          [eventId, todayStr]
        );
      } else if (payload.cancel_all_instances === false) {
        await conn.execute(
          `UPDATE event_instances SET is_cancelled = false, updated_at = CURRENT_TIMESTAMP 
           WHERE event_id = ? AND date >= ?`,
          [eventId, todayStr]
        );
      }

      // If recurrence data changed or regeneration forced, rebuild future instances
      if (shouldRegenerate) {
        if (!updatedRecurrenceData.start_date) {
          await conn.rollback();
          return res.status(400).json({
            error: 'Cannot regenerate recurrence without a start_date set on this event'
          });
        }
        // Delete all future instances (keep past ones to preserve history)
        await conn.execute(
          `DELETE FROM event_instances WHERE event_id = ? AND date >= ?`,
          [eventId, todayStr]
        );

        // Generate new instances using updated recurrence data
        const eventForGeneration = {
          id: eventId,
          recurrence_pattern: updatedRecurrenceData.recurrence_pattern,
          recurrence_days: updatedRecurrenceData.recurrence_days,
          start_date: updatedRecurrenceData.start_date,
          recurrence_end_date: updatedRecurrenceData.recurrence_end_date,
          recurrence_end_occurrences: updatedRecurrenceData.recurrence_end_occurrences
        };

        const instances = generateEventInstances(eventForGeneration);
        
        // Filter instances to only include future dates (from today onwards)
        const futureInstances = instances.filter(instance => instance.date >= todayStr);
        
        if (futureInstances.length > 0) {
          const insertInstanceSql = `
            INSERT INTO event_instances (id, event_id, date, crosses_midnight) 
            VALUES (?, ?, ?, ?)
          `;
          
          // Use the updated crosses_midnight value for new instances
          const finalCrossesMidnight = crossesMidnight !== null ? crossesMidnight : currentEvent.crosses_midnight;
          
          for (const instance of futureInstances) {
            const instanceId = uuidv4();
            await conn.execute(insertInstanceSql, [
              instanceId, 
              instance.event_id, 
              instance.date, 
              finalCrossesMidnight ? 1 : 0
            ]);
          }
        }

        await conn.commit();

        return res.json({ 
          success: true, 
          message: 'Event updated successfully with regenerated instances',
          data: { 
            id: eventId,
            instances_regenerated: futureInstances.length,
            recurrence_description: getRecurrenceDescription(eventForGeneration)
          }
        });
      } else {
        // No recurrence changes, just update existing instances' crosses_midnight if time changed
        if (crossesMidnight !== null) {
          await conn.execute(
            `UPDATE event_instances SET crosses_midnight = ? WHERE event_id = ? AND date >= ? AND custom_start_time IS NULL AND custom_end_time IS NULL`,
            [crossesMidnight ? 1 : 0, eventId, todayStr]
          );
        }

        await conn.commit();

        return res.json({ 
          success: true, 
          message: 'Event updated successfully',
          data: { id: eventId }
        });
      }
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
  updateEvent,
  deleteEvent,
  
  // Legacy function names for backward compatibility (redirect to new functions)
  getAllEvents: getEventInstances
};