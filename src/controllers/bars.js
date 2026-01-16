const db = require('../utils/db');
const { v4: uuidv4 } = require('uuid');

const normalizeTimeString = value => {
  if (value === undefined || value === null || value === '' || value === 'null') {
    return null;
  }
  let stringValue = typeof value === 'string' ? value : String(value);
  if (/^\d{2}:\d{2}:\d{2}$/.test(stringValue)) {
    return stringValue;
  }
  if (/^\d{2}:\d{2}$/.test(stringValue)) {
    return `${stringValue}:00`;
  }
  if (/^\d{1,2}$/.test(stringValue)) {
    return `${stringValue.padStart(2, '0')}:00:00`;
  }
  return null;
};

const fetchBarHours = async barId => {
  const hoursSql = `
    SELECT 
      id,
      day_of_week,
      open_time,
      close_time,
      is_closed,
      crosses_midnight
    FROM bar_hours 
    WHERE bar_id = ? 
    ORDER BY day_of_week
  `;
  const [rows] = await db.execute(hoursSql, [barId]);
  return rows.map(hour => ({
    id: hour.id,
    day_of_week: hour.day_of_week,
    open_time: normalizeTimeString(hour.open_time),
    close_time: normalizeTimeString(hour.close_time),
    is_closed: Boolean(hour.is_closed),
    crosses_midnight: Boolean(hour.crosses_midnight)
  }));
};

/**
 * Expected payload shape:
 * {
 *  name, 
 *  description, 
 *  address_street, 
 *  address_city, 
 *  address_state, 
 *  address_zip,
 *  latitude, 
 *  longitude, 
 *  phone, 
 *  website, 
 *  instagram, 
 *  facebook,
 *  twitter,
 *  posh,
 *  eventbrite,
 *  hours: [{ day_of_week: 0..6, open_time: 'HH:MM:SS', close_time: 'HH:MM:SS', is_closed: boolean }, ...],
 *  tag_ids: ['uuid', ...] // existing tag ids to relate
 * }
 * 
 * Note: The crosses_midnight field will be automatically calculated based on open_time and close_time.
 * If close_time is earlier than open_time, crosses_midnight will be set to true.
 */
async function createBar(req, res) {
  const payload = req.body;

  // Basic validation
  //  Name, street, city, state, zip are required
  if (!payload || !payload.name || !payload.address_street || !payload.address_city|| !payload.address_zip|| !payload.address_state)  {
    return res.status(400).json({ error: 'Missing required bar fields' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Check for duplicate bar (same name and address) - case insensitive
    const duplicateCheckSql = `
      SELECT id FROM bars 
      WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) 
      AND LOWER(TRIM(address_street)) = LOWER(TRIM(?)) 
      AND LOWER(TRIM(address_city)) = LOWER(TRIM(?)) 
      AND LOWER(TRIM(address_state)) = LOWER(TRIM(?)) 
      AND TRIM(address_zip) = TRIM(?) 
      AND is_active = 1
    `;
    const [duplicateRows] = await conn.execute(duplicateCheckSql, [
      payload.name,
      payload.address_street,
      payload.address_city,
      payload.address_state,
      payload.address_zip
    ]);

    if (duplicateRows && duplicateRows.length > 0) {
      await conn.rollback();
      return res.status(409).json({ error: 'A bar with this name and address already exists' });
    }

    // Insert bar record
    const barId = uuidv4();
    const insertBarSql = `INSERT INTO bars (
      id,
      name,
      description,
      address_street,
      address_city,
      address_state,
      address_zip,
      latitude,
      longitude,
      phone,
      website,
      instagram,
      facebook,
      twitter,
      posh,
      eventbrite,
      is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    await conn.execute(insertBarSql, [
      barId,
      payload.name,
      payload.description || null,
      payload.address_street,
      payload.address_city,
      payload.address_state,
      payload.address_zip,
      payload.latitude || null,
      payload.longitude || null,
      payload.phone || null,
      payload.website || null,
      payload.instagram || null,
      payload.facebook || null,
      payload.twitter || null,
      payload.posh || null,
      payload.eventbrite || null,
      1
    ]);

    // Insert hours if provided
    if (Array.isArray(payload.hours) && payload.hours.length > 0) {
      const insertHourSql = `
        INSERT INTO bar_hours (
          id,
          bar_id,
          day_of_week,
          open_time,
          close_time,
          is_closed,
          crosses_midnight
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `;
      for (const hour of payload.hours) {
        const hourId = uuidv4();
        let crossesMidnight = false;
        if (!hour.is_closed && hour.open_time && hour.close_time) {
          const openTime = hour.open_time.split(':').map(Number);
          const closeTime = hour.close_time.split(':').map(Number);
          if (
            closeTime[0] < openTime[0] ||
            (closeTime[0] === openTime[0] && closeTime[1] < openTime[1])
          ) {
            crossesMidnight = true;
          }
        }

        await conn.execute(insertHourSql, [
          hourId,
          barId,
          hour.day_of_week,
          hour.is_closed ? null : hour.open_time,
          hour.is_closed ? null : hour.close_time,
          hour.is_closed ? 1 : 0,
          crossesMidnight ? 1 : 0
        ]);
      }
    }

    // Insert bar_tag_assignments relationships if provided (Just submitting tag ids, more efficient))
    if (Array.isArray(payload.tag_ids) && payload.tag_ids.length > 0) {
      const insertBarTagSql = `INSERT INTO bar_tag_assignments (bar_id, tag_id) VALUES (?, ?)`;
      for (const tagId of payload.tag_ids) {
        await conn.execute(insertBarTagSql, [barId, tagId]);
      }
    }

    await conn.commit();

    return res.status(201).json({ data: { id: barId } });
  } catch (err) {
    await conn.rollback();
    console.error('Error creating bar:', err.message || err);
    return res.status(500).json({ error: 'Failed to create bar' });
  } finally {
    conn.release();
  }
}

/**
 * GET /bars?include=hours,tags,events&tag=uuid1,uuid2,uuid3&open_now=true&lat=40.7128&lon=-74.0060&radius=5&unit=miles&page=1&limit=20
 * Returns all active bars with optional related data and filtering
 * Query parameters:
 * - include: comma-separated list of related data to include (hours, tags, events)
 * - tag: filter by tag ID(s) - single UUID or comma-separated UUIDs
 * - open_now: filter by bars currently open (true/false)
 * - lat: user's latitude for distance-based sorting and radius filtering
 * - lon: user's longitude for distance-based sorting and radius filtering
 * - radius: maximum distance from user location (requires lat/lon)
 * - unit: distance unit - 'km' (kilometers, default) or 'miles'
 * - page: page number for pagination (default: 1, minimum: 1)
 * - limit: number of results per page (default: 50, minimum: 1, maximum: 100)
 */
async function getAllBars(req, res) {
  try {
    const { include, tag, open_now, lat, lon, radius, unit, page, limit } = req.query;
    const includeOptions = include ? include.split(',').map(i => i.trim().toLowerCase()) : [];
    
    // Validate and set pagination parameters
    let pageNumber = 1;
    let limitNumber = 50; // Default limit
    
    if (page !== undefined) {
      pageNumber = parseInt(page);
      if (isNaN(pageNumber) || pageNumber < 1) {
        return res.status(400).json({ error: 'Page must be a positive integer starting from 1.' });
      }
    }
    
    if (limit !== undefined) {
      limitNumber = parseInt(limit);
      if (isNaN(limitNumber) || limitNumber < 1 || limitNumber > 100) {
        return res.status(400).json({ error: 'Limit must be between 1 and 100.' });
      }
    }
    
    const offset = (pageNumber - 1) * limitNumber;
    
    // Validate lat/lon parameters if provided
    let userLat = null;
    let userLon = null;
    let radiusValue = null;
    let distanceUnit = 'km'; // Default to kilometers
    
    if (lat !== undefined && lon !== undefined) {
      userLat = parseFloat(lat);
      userLon = parseFloat(lon);
      
      if (isNaN(userLat) || isNaN(userLon) || userLat < -90 || userLat > 90 || userLon < -180 || userLon > 180) {
        return res.status(400).json({ error: 'Invalid latitude or longitude. Latitude must be between -90 and 90, longitude between -180 and 180.' });
      }
      
      // Validate radius if provided
      if (radius !== undefined) {
        radiusValue = parseFloat(radius);
        if (isNaN(radiusValue) || radiusValue <= 0) {
          return res.status(400).json({ error: 'Radius must be a positive number.' });
        }
      }
      
      // Validate unit if provided
      if (unit !== undefined) {
        if (unit.toLowerCase() !== 'km' && unit.toLowerCase() !== 'miles') {
          return res.status(400).json({ error: 'Unit must be either "km" or "miles".' });
        }
        distanceUnit = unit.toLowerCase();
      }
    } else if (radius !== undefined || unit !== undefined) {
      return res.status(400).json({ error: 'Radius and unit parameters require both lat and lon to be provided.' });
    }
    
    // Build dynamic query
    let selectClauses = ['DISTINCT b.*'];
    let joinClauses = [];
    let whereClauses = ['b.is_active = 1'];
    let params = [];
    
    // Add distance calculation if user location is provided
    if (userLat !== null && userLon !== null) {
      // Earth radius: 6371 km or 3959 miles
      const earthRadius = distanceUnit === 'miles' ? 3959 : 6371;
      
      selectClauses.push(`ROUND((
        ${earthRadius} * acos(
          cos(radians(?)) * cos(radians(b.latitude)) * 
          cos(radians(b.longitude) - radians(?)) + 
          sin(radians(?)) * sin(radians(b.latitude))
        )
      ), 2) as distance_${distanceUnit}`);
      params.push(userLat, userLon, userLat);
      
      // Only include bars that have coordinates when distance sorting is requested
      whereClauses.push('b.latitude IS NOT NULL AND b.longitude IS NOT NULL');
      
      // Add radius filter if specified
      if (radiusValue !== null) {
        whereClauses.push(`(
          ${earthRadius} * acos(
            cos(radians(?)) * cos(radians(b.latitude)) * 
            cos(radians(b.longitude) - radians(?)) + 
            sin(radians(?)) * sin(radians(b.latitude))
          )
        ) <= ?`);
        params.push(userLat, userLon, userLat, radiusValue);
      }
    }
    
    // Add filter conditions
    if (tag) {
      const tagIds = [...new Set(tag.split(',').map(id => id.trim()).filter(id => id.length > 0))]; // Remove duplicates
      if (tagIds.length > 0) {
        joinClauses.push('INNER JOIN bar_tag_assignments bt_filter ON b.id = bt_filter.bar_id');
        const placeholders = tagIds.map(() => '?').join(',');
        whereClauses.push(`bt_filter.tag_id IN (${placeholders})`);
        params.push(...tagIds);
      }
    }
    
    // Add open_now filter
    if (open_now === 'true') {
      whereClauses.push(`EXISTS (
        SELECT 1 FROM bar_hours bh_open 
        WHERE bh_open.bar_id = b.id 
        AND bh_open.is_closed = 0
        AND (
          -- Normal hours (does not cross midnight)
          (bh_open.crosses_midnight = 0 
           AND bh_open.day_of_week = DAYOFWEEK(NOW()) - 1
           AND TIME(NOW()) BETWEEN bh_open.open_time AND bh_open.close_time)
          OR 
          -- Cross-midnight hours - currently past opening time (same day)
          (bh_open.crosses_midnight = 1 
           AND bh_open.day_of_week = DAYOFWEEK(NOW()) - 1
           AND TIME(NOW()) >= bh_open.open_time)
          OR
          -- Cross-midnight hours - before closing time (next day)
          (bh_open.crosses_midnight = 1 
           AND bh_open.day_of_week = MOD(DAYOFWEEK(NOW()) - 2 + 7, 7)
           AND TIME(NOW()) <= bh_open.close_time)
        )
      )`);
    }
    
    // Add joins and select clauses based on include parameters
    if (includeOptions.includes('tags')) {
      joinClauses.push('LEFT JOIN bar_tag_assignments bt ON b.id = bt.bar_id');
      joinClauses.push('LEFT JOIN bar_tags t ON bt.tag_id = t.id');
      selectClauses.push(`GROUP_CONCAT(
        DISTINCT CONCAT(t.id, ':', t.name, ':', COALESCE(t.category, ''))
      ) as tags`);
    }
    
    if (includeOptions.includes('events')) {
      joinClauses.push(`LEFT JOIN events e ON b.id = e.bar_id 
        AND e.is_active = 1 
        AND e.date >= CURDATE()`);
      selectClauses.push(`GROUP_CONCAT(
        DISTINCT CONCAT(e.id, ':', e.title, ':', e.date, ':', COALESCE(e.start_time, ''), ':', COALESCE(e.category, ''))
      ) as upcoming_events`);
    }
    
    // Construct query
    let selectSql = `SELECT ${selectClauses.join(', ')} FROM bars b`;
    if (joinClauses.length > 0) {
      selectSql += ` ${joinClauses.join(' ')}`;
    }
    selectSql += ` WHERE ${whereClauses.join(' AND ')}`;
    
    if (includeOptions.length > 0 || tag || open_now === 'true') {
      selectSql += ` GROUP BY b.id`;
    }
    
    // Order by distance if user location provided, otherwise by name
    if (userLat !== null && userLon !== null) {
      selectSql += ` ORDER BY distance_${distanceUnit} ASC, b.name`;
    } else {
      selectSql += ' ORDER BY b.name';
    }
    
    // Get total count for pagination metadata (before applying LIMIT/OFFSET)
    let countSql = selectSql.replace(`SELECT ${selectClauses.join(', ')}`, 'SELECT COUNT(DISTINCT b.id) as total');
    countSql = countSql.replace(/ ORDER BY.*$/, '');
    
    const [countResult] = await db.query(countSql, params);
    const totalItems = countResult[0].total;
    
    // Add pagination to main query
    selectSql += ` LIMIT ? OFFSET ?`;
    params.push(limitNumber, offset);
    
    const [rows] = await db.query(selectSql, params);
    
    const bars = await Promise.all(rows.map(async bar => {
      const result = { ...bar };
      
      if (includeOptions.includes('hours')) {
        result.hours = await fetchBarHours(bar.id);
      }
      
      if (includeOptions.includes('tags') && bar.tags) {
        result.tags = bar.tags.split(',').map(t => {
          const [id, name, category] = t.split(':');
          return {
            id,
            name,
            category: category || null
          };
        });
      } else if (includeOptions.includes('tags')) {
        result.tags = [];
      }
      
      if (includeOptions.includes('events') && bar.upcoming_events) {
        result.upcoming_events = bar.upcoming_events.split(',').map(e => {
          const [id, title, date, start_time, category] = e.split(':');
          return {
            id,
            title,
            date,
            start_time: start_time || null,
            category: category || null
          };
        });
      } else if (includeOptions.includes('events')) {
        result.upcoming_events = [];
      }
      
      return result;
    }));
    
    // Calculate pagination metadata
    const totalPages = Math.ceil(totalItems / limitNumber);
    const hasNextPage = pageNumber < totalPages;
    const hasPrevPage = pageNumber > 1;
    
    return res.json({ 
      success: true, 
      data: bars,
      meta: {
        count: bars.length,
        total: totalItems,
        page: pageNumber,
        limit: limitNumber,
        totalPages: totalPages,
        hasNextPage: hasNextPage,
        hasPrevPage: hasPrevPage,
        filters: { tag, open_now, radius: radiusValue, unit: distanceUnit },
        included: includeOptions,
        location: userLat !== null && userLon !== null ? { 
          lat: userLat, 
          lon: userLon, 
          sorted_by_distance: true,
          unit: distanceUnit
        } : null
      }
    });
  } catch (err) {
    console.error('Error fetching bars:', err.message || err);
    return res.status(500).json({ error: 'Failed to fetch bars' });
  }
}

/**
 * GET /bars/:id?include=hours,tags,events
 * Returns a single bar with optional related data based on include parameter
 * Query parameters:
 * - include: comma-separated list of related data to include (hours, tags, events)
 */
async function getBar(req, res) {
  try {
    const barId = req.params.id;
    const { include } = req.query;
    const includeOptions = include ? include.split(',').map(i => i.trim().toLowerCase()) : ['hours', 'tags']; // Default includes
    
    // Build base query
    let joinClauses = [];
    let selectClauses = ['b.*'];
    
    // Add joins and select clauses based on include parameters
    if (includeOptions.includes('tags')) {
      joinClauses.push('LEFT JOIN bar_tag_assignments bt ON b.id = bt.bar_id');
      joinClauses.push('LEFT JOIN bar_tags t ON bt.tag_id = t.id');
      selectClauses.push(`GROUP_CONCAT(
        DISTINCT CONCAT(t.id, ':', t.name, ':', COALESCE(t.category, ''))
      ) as tags`);
    }
    
    if (includeOptions.includes('events')) {
      joinClauses.push(`LEFT JOIN events e ON b.id = e.bar_id 
        AND e.is_active = 1 
        AND e.date >= CURDATE()`);
      selectClauses.push(`GROUP_CONCAT(
        DISTINCT CONCAT(e.id, ':', e.title, ':', e.date, ':', COALESCE(e.start_time, ''), ':', COALESCE(e.category, ''))
      ) as upcoming_events`);
    }
    
    // Construct final query
    let selectSql = `SELECT ${selectClauses.join(', ')} FROM bars b`;
    if (joinClauses.length > 0) {
      selectSql += ` ${joinClauses.join(' ')}`;
    }
    selectSql += ` WHERE b.id = ? AND b.is_active = 1`;
    
    if (joinClauses.length > 0) {
      selectSql += ` GROUP BY b.id`;
    }
    
    const [rows] = await db.query(selectSql, [barId]);
    
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Bar not found' });
    }
    
    const bar = rows[0];
    const result = { ...bar };
    
    // Parse the results based on what was included
    if (includeOptions.includes('hours')) {
      result.hours = await fetchBarHours(barId);
    }
    
    if (includeOptions.includes('tags') && bar.tags) {
      result.tags = bar.tags.split(',').map(t => {
        const [id, name, category] = t.split(':');
        return {
          id,
          name,
          category: category || null
        };
      });
    } else if (includeOptions.includes('tags')) {
      result.tags = [];
    }
    
    if (includeOptions.includes('events') && bar.upcoming_events) {
      result.upcoming_events = bar.upcoming_events.split(',').map(e => {
        const [id, title, date, start_time, category] = e.split(':');
        return {
          id,
          title,
          date,
          start_time: start_time || null,
          category: category || null
        };
      });
    } else if (includeOptions.includes('events')) {
      result.upcoming_events = [];
    }
    
    return res.json({ 
      success: true, 
      data: result,
      meta: {
        included: includeOptions
      }
    });
  } catch (err) {
    console.error('Error fetching bar:', err.message || err);
    return res.status(500).json({ error: 'Failed to fetch bar' });
  }
}

/**
 * PUT /bars/:id
 * Updates an existing bar's basic information only (protected route)
 * Note: This endpoint only updates bar information, not hours or tags
 */
async function updateBar(req, res) {
  try {
    const barId = req.params.id;
    const payload = req.body;
    const userId = req.user.userId; // From JWT
    
    // Check if bar exists and is active
    const checkSql = `SELECT id FROM bars WHERE id = ? AND is_active = 1`;
    const [checkRows] = await db.execute(checkSql, [barId]);
    
    if (!checkRows || checkRows.length === 0) {
      return res.status(404).json({ error: 'Bar not found' });
    }
    
    // Warn if hours or tag_ids are provided in the payload
    if (payload.hours || payload.tag_ids) {
      return res.status(400).json({ 
        error: 'This endpoint only updates basic bar information. Hours and tags cannot be updated through this endpoint.' 
      });
    }
    
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      
      // Only check for duplicates if we have a complete set of required fields
      // Either all provided in payload, or we need to get current data
      if (payload.name && payload.address_street && payload.address_city && 
          payload.address_state && payload.address_zip) {
        
        // Check for duplicates with all provided values (excluding current bar)
        const duplicateCheckSql = `
          SELECT id FROM bars 
          WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) 
          AND LOWER(TRIM(address_street)) = LOWER(TRIM(?)) 
          AND LOWER(TRIM(address_city)) = LOWER(TRIM(?)) 
          AND LOWER(TRIM(address_state)) = LOWER(TRIM(?)) 
          AND TRIM(address_zip) = TRIM(?) 
          AND id != ? 
          AND is_active = 1
        `;
        const [duplicateRows] = await conn.execute(duplicateCheckSql, [
          payload.name, payload.address_street, payload.address_city, 
          payload.address_state, payload.address_zip, barId
        ]);
        
        if (duplicateRows && duplicateRows.length > 0) {
          await conn.rollback();
          return res.status(409).json({ error: 'A bar with this name and address already exists' });
        }
      }
      
      // Update basic bar information only
      const updateSql = `
        UPDATE bars SET 
          name = COALESCE(?, name),
          description = COALESCE(?, description),
          address_street = COALESCE(?, address_street),
          address_city = COALESCE(?, address_city),
          address_state = COALESCE(?, address_state),
          address_zip = COALESCE(?, address_zip),
          latitude = COALESCE(?, latitude),
          longitude = COALESCE(?, longitude),
          phone = COALESCE(?, phone),
          website = COALESCE(?, website),
          instagram = COALESCE(?, instagram),
          facebook = COALESCE(?, facebook),
          twitter = COALESCE(?, twitter),
          posh = COALESCE(?, posh),
          eventbrite = COALESCE(?, eventbrite),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;
      
      await conn.execute(updateSql, [
        payload.name || null,
        payload.description || null,
        payload.address_street || null,
        payload.address_city || null,
        payload.address_state || null,
        payload.address_zip || null,
        payload.latitude || null,
        payload.longitude || null,
        payload.phone || null,
        payload.website || null,
        payload.instagram || null,
        payload.facebook || null,
        payload.twitter || null,
        payload.posh || null,
        payload.eventbrite || null,
        barId
      ]);
      
      await conn.commit();
      
      return res.json({ 
        success: true, 
        message: 'Bar information updated successfully',
        data: { id: barId }
      });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('Error updating bar:', err.message || err);
    return res.status(500).json({ error: 'Failed to update bar' });
  }
}

/**
 * DELETE /bars/:id
 * Soft deletes a bar (sets is_active to false) - (protected route)
 */
async function deleteBar(req, res) {
  try {
    const barId = req.params.id;
    const userId = req.user.userId; // From JWT
    
    const deleteSql = `UPDATE bars SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND is_active = 1`;
    const [result] = await db.execute(deleteSql, [barId]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Bar not found' });
    }
    
    return res.json({ 
      success: true, 
      message: 'Bar deleted successfully',
      data: { id: barId }
    });
  } catch (err) {
    console.error('Error deleting bar:', err.message || err);
    return res.status(500).json({ error: 'Failed to delete bar' });
  }
}

/**
 * GET /bars/search/name?q=searchterm
 * Lightweight search for bars by name - returns only essential data for fast autocomplete/search
 * 
 * Features:
 * - Case-insensitive search
 * - Handles special characters (e.g., "O'Connell's" matches "oconnells")
 * - No complex JOINs for optimal performance
 * - Returns only essential fields: UUID, name, and complete address
 * 
 * Query Parameters:
 * - q (required): Search term for bar name matching
 * 
 * Returns: Bar UUID, name, and address information only
 * Response format: { success: true, data: [...], meta: { query, count } }
 */
async function searchBarsByName(req, res) {
  try {
    const { q: searchQuery } = req.query;
    
    if (!searchQuery || searchQuery.trim().length === 0) {
      return res.status(400).json({ error: 'Search query parameter "q" is required' });
    }
    
    // Normalize search term: remove special characters and convert to lowercase
    const normalizedSearch = searchQuery.trim().toLowerCase().replace(/[^a-z0-9\s]/g, '');
    const searchTerm = `%${normalizedSearch}%`;
    
    // Simple query - only essential fields with flexible search
    const selectSql = `
      SELECT 
        b.id,
        b.name,
        b.address_street,
        b.address_city,
        b.address_state,
        b.address_zip
      FROM bars b
      WHERE b.is_active = 1 
      AND (
        LOWER(REPLACE(REPLACE(b.name, '''', ''), '-', '')) LIKE ?
        OR LOWER(b.name) LIKE LOWER(?)
      )
      ORDER BY 
        CASE 
          WHEN LOWER(b.name) LIKE LOWER(?) THEN 1
          ELSE 2
        END,
        b.name
    `;
    
    const [rows] = await db.query(selectSql, [searchTerm, `%${searchQuery.trim()}%`, `%${searchQuery.trim()}%`]);
    
    return res.json({ 
      success: true, 
      data: rows,
      meta: {
        query: searchQuery,
        count: rows.length
      }
    });
  } catch (err) {
    console.error('Error searching bars by name:', err.message || err);
    return res.status(500).json({ error: 'Failed to search bars' });
  }
}

/**
 * POST /bars/:barId/tags/:tagId
 * Adds a tag to a bar (protected route)
 */
async function addTagToBar(req, res) {
  try {
    const { barId, tagId } = req.params;
    const userId = req.user.userId; // From JWT
    
    // Check if bar exists and is active
    const checkBarSql = `SELECT id FROM bars WHERE id = ? AND is_active = 1`;
    const [barRows] = await db.execute(checkBarSql, [barId]);
    
    if (!barRows || barRows.length === 0) {
      return res.status(404).json({ error: 'Bar not found' });
    }
    
    // Check if tag exists
    const checkTagSql = `SELECT id FROM bar_tags WHERE id = ?`;
    const [tagRows] = await db.execute(checkTagSql, [tagId]);
    
    if (!tagRows || tagRows.length === 0) {
      return res.status(404).json({ error: 'Tag not found' });
    }
    
    // Check if relationship already exists
    const checkRelationSql = `SELECT bar_id, tag_id FROM bar_tag_assignments WHERE bar_id = ? AND tag_id = ?`;
    const [relationRows] = await db.execute(checkRelationSql, [barId, tagId]);
    
    if (relationRows && relationRows.length > 0) {
      return res.status(409).json({ error: 'Tag is already associated with this bar' });
    }
    
    // Add the tag to the bar
    const insertSql = `INSERT INTO bar_tag_assignments (bar_id, tag_id) VALUES (?, ?)`;
    await db.execute(insertSql, [barId, tagId]);
    
    return res.status(201).json({
      success: true,
      message: 'Tag added to bar successfully',
      data: {
        bar_id: barId,
        tag_id: tagId
      }
    });
  } catch (err) {
    console.error('Error adding tag to bar:', err.message || err);
    return res.status(500).json({ error: 'Failed to add tag to bar' });
  }
}

/**
 * DELETE /bars/:barId/tags/:tagId
 * Removes a tag from a bar (protected route)
 */
async function removeTagFromBar(req, res) {
  try {
    const { barId, tagId } = req.params;
    const userId = req.user.userId; // From JWT
    
    // Check if bar exists and is active
    const checkBarSql = `SELECT id FROM bars WHERE id = ? AND is_active = 1`;
    const [barRows] = await db.execute(checkBarSql, [barId]);
    
    if (!barRows || barRows.length === 0) {
      return res.status(404).json({ error: 'Bar not found' });
    }
    
    // Check if tag exists
    const checkTagSql = `SELECT id FROM bar_tags WHERE id = ?`;
    const [tagRows] = await db.execute(checkTagSql, [tagId]);
    
    if (!tagRows || tagRows.length === 0) {
      return res.status(404).json({ error: 'Tag not found' });
    }
    
    // Check if relationship exists
    const checkRelationSql = `SELECT bar_id, tag_id FROM bar_tag_assignments WHERE bar_id = ? AND tag_id = ?`;
    const [relationRows] = await db.execute(checkRelationSql, [barId, tagId]);
    
    if (!relationRows || relationRows.length === 0) {
      return res.status(404).json({ error: 'Tag is not associated with this bar' });
    }
    
    // Remove the tag from the bar
    const deleteSql = `DELETE FROM bar_tag_assignments WHERE bar_id = ? AND tag_id = ?`;
    const [result] = await db.execute(deleteSql, [barId, tagId]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Tag association not found' });
    }
    
    return res.json({
      success: true,
      message: 'Tag removed from bar successfully',
      data: {
        bar_id: barId,
        tag_id: tagId
      }
    });
  } catch (err) {
    console.error('Error removing tag from bar:', err.message || err);
    return res.status(500).json({ error: 'Failed to remove tag from bar' });
  }
}

/**
 * GET /bars/:barId/links
 * Returns all public-facing links for a specific bar
 * Public endpoint - no authentication required
 */
async function getBarLinks(req, res) {
  try {
    const { barId } = req.params;

    const linksSql = `
      SELECT 
        id,
        website,
        instagram,
        facebook,
        twitter,
        posh,
        eventbrite
      FROM bars 
      WHERE id = ? AND is_active = 1
    `;

    const [rows] = await db.execute(linksSql, [barId]);

    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Bar not found' });
    }

    const bar = rows[0];

    return res.json({
      success: true,
      data: {
        bar_id: bar.id,
        website: bar.website || null,
        instagram: bar.instagram || null,
        facebook: bar.facebook || null,
        twitter: bar.twitter || null,
        posh: bar.posh || null,
        eventbrite: bar.eventbrite || null
      }
    });
  } catch (err) {
    console.error('Error fetching bar links:', err.message || err);
    return res.status(500).json({ error: 'Failed to fetch bar links' });
  }
}

/**
 * Get all tags associated with a specific bar
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getBarTags = async (req, res) => {
  const { barId } = req.params;

  const conn = await db.getConnection();
  try {
    // Verify bar exists
    const [barRows] = await conn.execute(
      'SELECT id, name FROM bars WHERE id = ? AND is_active = 1',
      [barId]
    );

    if (barRows.length === 0) {
      conn.release();
      return res.status(404).json({ error: 'Bar not found' });
    }

    // Get all tags associated with this bar
    const [tagRows] = await conn.execute(
      `SELECT t.id, t.name, t.category, t.created_at
       FROM bar_tags t
       INNER JOIN bar_tag_assignments bt ON t.id = bt.tag_id
       WHERE bt.bar_id = ?
       ORDER BY t.name ASC`,
      [barId]
    );

    res.status(200).json({
      success: true,
      data: tagRows,
      meta: {
        bar: {
          id: barRows[0].id,
          name: barRows[0].name
        },
        total: tagRows.length
      }
    });
  } catch (err) {
    console.error('Error fetching bar tags:', err.message || err);
    return res.status(500).json({ error: 'Failed to fetch bar tags' });
  } finally {
    conn.release();
  }
}

/**
 * GET /bars/:barId/hours
 * Returns all hours for a specific bar
 * Public endpoint - no authentication required
 */
async function getBarHours(req, res) {
  try {
    const barId = req.params.barId;
    
    // First check if the bar exists and is active
    const barCheckSql = `SELECT id, name FROM bars WHERE id = ? AND is_active = 1`;
    const [barRows] = await db.execute(barCheckSql, [barId]);
    
    if (!barRows || barRows.length === 0) {
      return res.status(404).json({ error: 'Bar not found' });
    }
    
    const hours = await fetchBarHours(barId);
    
    return res.json({
      success: true,
      data: hours,
      meta: {
        bar: {
          id: barRows[0].id,
          name: barRows[0].name
        },
        total: hours.length
      }
    });
  } catch (err) {
    console.error('Error fetching bar hours:', err.message || err);
    return res.status(500).json({ error: 'Failed to fetch bar hours' });
  }
}

/**
 * PUT /bars/:barId/hours
 * Updates/replaces all hours for a specific bar
 * Protected endpoint - requires authentication
 * 
 * Expected payload:
 * {
 *   hours: [
 *     { day_of_week: 0, open_time: "12:00:00", close_time: "23:00:00", is_closed: false },
 *     { day_of_week: 1, open_time: null, close_time: null, is_closed: true },
 *     ...
 *   ]
 * }
 */
async function updateBarHours(req, res) {
  const barId = req.params.barId;
  const { hours } = req.body;
  
  // Validate payload
  if (!Array.isArray(hours)) {
    return res.status(400).json({ error: 'Hours must be provided as an array' });
  }
  
  // Validate each hour entry
  for (const hour of hours) {
    if (typeof hour.day_of_week !== 'number' || hour.day_of_week < 0 || hour.day_of_week > 6) {
      return res.status(400).json({ error: 'day_of_week must be a number between 0 and 6' });
    }
    
    if (typeof hour.is_closed !== 'boolean') {
      return res.status(400).json({ error: 'is_closed must be a boolean' });
    }
    
    // If not closed, validate time formats
    if (!hour.is_closed) {
      if (!hour.open_time || !hour.close_time) {
        return res.status(400).json({ 
          error: 'open_time and close_time are required when is_closed is false' 
        });
      }
      
      // Basic time format validation (HH:MM:SS)
      const timeRegex = /^([01]?\d|2[0-3]):[0-5]\d:[0-5]\d$/;
      if (!timeRegex.test(hour.open_time) || !timeRegex.test(hour.close_time)) {
        return res.status(400).json({ 
          error: 'Time must be in HH:MM:SS format' 
        });
      }
    }
  }
  
  // Check for duplicate day_of_week values
  const daySet = new Set(hours.map(h => h.day_of_week));
  if (daySet.size !== hours.length) {
    return res.status(400).json({ error: 'Duplicate day_of_week values are not allowed' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    
    // Check if bar exists and is active
    const barCheckSql = `SELECT id FROM bars WHERE id = ? AND is_active = 1`;
    const [barRows] = await conn.execute(barCheckSql, [barId]);
    
    if (!barRows || barRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Bar not found' });
    }
    
    // Delete all existing hours for the bar
    const deleteSql = `DELETE FROM bar_hours WHERE bar_id = ?`;
    await conn.execute(deleteSql, [barId]);
    
    // Insert new hours
    const insertSql = `
      INSERT INTO bar_hours (id, bar_id, day_of_week, open_time, close_time, is_closed, crosses_midnight) 
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    
    for (const hour of hours) {
      const hourId = uuidv4();
      
      // Determine if hours cross midnight
      let crossesMidnight = false;
      if (!hour.is_closed && hour.open_time && hour.close_time) {
        // Convert time strings to comparable format (assuming HH:MM:SS or HH:MM format)
        const openTime = hour.open_time.split(':').map(Number);
        const closeTime = hour.close_time.split(':').map(Number);
        
        // Compare hours, then minutes if hours are equal
        if (closeTime[0] < openTime[0] || 
            (closeTime[0] === openTime[0] && closeTime[1] < openTime[1])) {
          crossesMidnight = true;
        }
      }
      
      const params = [
        hourId,
        barId,
        hour.day_of_week,
        hour.is_closed ? null : hour.open_time,
        hour.is_closed ? null : hour.close_time,
        hour.is_closed ? 1 : 0,
        crossesMidnight ? 1 : 0
      ];
      await conn.execute(insertSql, params);
    }
    
    await conn.commit();
    
    return res.json({
      success: true,
      message: 'Bar hours updated successfully',
      data: {
        bar_id: barId,
        hours_count: hours.length
      }
    });
  } catch (err) {
    await conn.rollback();
    console.error('Error updating bar hours:', err.message || err);
    return res.status(500).json({ error: 'Failed to update bar hours' });
  } finally {
    conn.release();
  }
}

module.exports = {
  createBar,
  getAllBars,
  getBar,
  updateBar,
  deleteBar,
  searchBarsByName,
  addTagToBar,
  removeTagFromBar,
  getBarLinks,
  getBarTags,
  getBarHours,
  updateBarHours
};
