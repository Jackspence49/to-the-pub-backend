const db = require('../utils/db');
const { v4: uuidv4 } = require('uuid');

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
 *  hours: [{ day_of_week: 0..6, open_time: 'HH:MM:SS', close_time: 'HH:MM:SS', is_closed: boolean }, ...],
 *  tag_ids: ['uuid', ...] // existing tag ids to relate
 * }
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

// Inserting Business information into Bar table
    const barId = uuidv4();
    const insertBarSql = `INSERT INTO bars (id, name, description, address_street, address_city, address_state, address_zip, latitude, longitude, phone, website, instagram, facebook, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const barParams = [
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
      payload.is_active === false ? 0 : 1
    ];
    await conn.execute(insertBarSql, barParams);

    // Insert hours to bar-hours if provided
    if (Array.isArray(payload.hours)) {
      const insertHourSql = `INSERT INTO bar_hours (id, bar_id, day_of_week, open_time, close_time, is_closed) VALUES (?, ?, ?, ?, ?, ?)`;
      for (const h of payload.hours) {
        const hourId = uuidv4();
        const hourParams = [
          hourId,
          barId,
          h.day_of_week,
          h.open_time || null,
          h.close_time || null,
          h.is_closed ? 1 : 0
        ];
        await conn.execute(insertHourSql, hourParams);
      }
    }

    // Insert bar_tags relationships if provided (Just submitting tag ids, more efficient))
    if (Array.isArray(payload.tag_ids)) {
      const insertBarTagSql = `INSERT INTO bar_tags (bar_id, tag_id) VALUES (?, ?)`;
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
 * GET /bars?include=hours,tags,events&tag=sports&page=1&limit=20&lat=42.3601&lon=-71.0589&radius=5&unit=miles
 * Returns all active bars with optional filtering and related data
 * Query parameters:
 * - include: comma-separated list of related data to include (hours, tags, events)
 * - tag: filter by tag name (case-insensitive)
 * - open_now: filter by bars currently open (true/false)
 * - has_events: filter by bars with upcoming events (true/false)
 * - page: page number for pagination (default: 1)
 * - limit: maximum number of results per page (default: 20)
 * - lat: latitude coordinate for geolocation search (required with lon)
 * - lon: longitude coordinate for geolocation search (required with lat)
 * - radius: search radius in specified unit (default: 5, max: 50)
 * - unit: distance unit 'miles' or 'km' (default: 'miles')
 */
async function getAllBars(req, res) {
  try {
    const { 
      include, 
      tag, 
      open_now, 
      has_events, 
      page = 1, 
      limit = 20,
      lat,
      lon,
      radius = 5,
      unit = 'miles'
    } = req.query;

    // Geolocation parameter validation
    if ((lat && !lon) || (!lat && lon)) {
      return res.status(400).json({ error: 'Both lat and lon parameters must be provided together' });
    }

    if (lat && lon) {
      const latitude = parseFloat(lat);
      const longitude = parseFloat(lon);
      
      // Validate coordinate ranges
      if (isNaN(latitude) || latitude < -90 || latitude > 90) {
        return res.status(400).json({ error: 'Latitude must be a number between -90 and 90' });
      }
      
      if (isNaN(longitude) || longitude < -180 || longitude > 180) {
        return res.status(400).json({ error: 'Longitude must be a number between -180 and 180' });
      }
    }

    // Validate radius
    const radiusNum = parseFloat(radius);
    if (isNaN(radiusNum) || radiusNum <= 0 || radiusNum > 50) {
      return res.status(400).json({ error: 'Radius must be a number between 0 and 50' });
    }

    // Validate unit
    if (!['miles', 'km'].includes(unit)) {
      return res.status(400).json({ error: 'Unit must be either "miles" or "km"' });
    }
    
    const includeOptions = include ? include.split(',').map(i => i.trim().toLowerCase()) : [];
    
    // Build dynamic query
    let selectClauses = ['DISTINCT b.*'];
    let joinClauses = [];
    let whereClauses = ['b.is_active = 1'];
    let params = [];
    let orderByClause = 'b.name';
    
    // Add distance calculation if lat/lon provided
    if (lat && lon) {
      const latitude = parseFloat(lat);
      const longitude = parseFloat(lon);
      
      // Calculate distance using Haversine formula
      // Formula: ACOS(SIN(RADIANS(lat1)) * SIN(RADIANS(lat2)) + COS(RADIANS(lat1)) * COS(RADIANS(lat2)) * COS(RADIANS(lon2) - RADIANS(lon1))) * 6371
      const earthRadiusKm = 6371;
      const earthRadiusMiles = 3959;
      const earthRadius = unit === 'km' ? earthRadiusKm : earthRadiusMiles;
      
      const distanceFormula = `
        (${earthRadius} * ACOS(
          GREATEST(-1, LEAST(1,
            SIN(RADIANS(?)) * SIN(RADIANS(b.latitude)) + 
            COS(RADIANS(?)) * COS(RADIANS(b.latitude)) * 
            COS(RADIANS(b.longitude) - RADIANS(?))
          ))
        ))
      `;
      
      selectClauses.push(`${distanceFormula} AS distance`);
      selectClauses.push(`'${unit}' AS distanceUnit`);
      
      // Only include bars within the specified radius and that have coordinates
      whereClauses.push('b.latitude IS NOT NULL AND b.longitude IS NOT NULL');
      whereClauses.push(`${distanceFormula} <= ?`);
      
      // Add parameters for distance calculation (lat, lat, lon for SELECT, lat, lat, lon for WHERE, radius)
      params.push(latitude, latitude, longitude, latitude, latitude, longitude, radiusNum);
      
      // Sort by distance when using geolocation
      orderByClause = 'distance ASC';
    }
    
    // Add filter conditions
    if (tag) {
      joinClauses.push('INNER JOIN bar_tags bt_filter ON b.id = bt_filter.bar_id');
      joinClauses.push('INNER JOIN tags t_filter ON bt_filter.tag_id = t_filter.id');
      whereClauses.push('LOWER(t_filter.name) = LOWER(?)');
      params.push(tag);
    }
    
    if (has_events === 'true') {
      joinClauses.push('INNER JOIN events e_filter ON b.id = e_filter.bar_id');
      whereClauses.push('e_filter.is_active = 1 AND e_filter.event_date >= CURDATE()');
    }
    
    // Add joins and select clauses based on include parameters
    if (includeOptions.includes('hours')) {
      joinClauses.push('LEFT JOIN bar_hours bh ON b.id = bh.bar_id');
      selectClauses.push(`GROUP_CONCAT(
        DISTINCT CONCAT(bh.day_of_week, ':', bh.open_time, ':', bh.close_time, ':', bh.is_closed)
      ) as hours`);
    }
    
    if (includeOptions.includes('tags')) {
      joinClauses.push('LEFT JOIN bar_tags bt ON b.id = bt.bar_id');
      joinClauses.push('LEFT JOIN tags t ON bt.tag_id = t.id');
      selectClauses.push(`GROUP_CONCAT(
        DISTINCT CONCAT(t.id, ':', t.name, ':', COALESCE(t.category, ''))
      ) as tags`);
    }
    
    if (includeOptions.includes('events')) {
      joinClauses.push(`LEFT JOIN events e ON b.id = e.bar_id 
        AND e.is_active = 1 
        AND e.event_date >= CURDATE()`);
      selectClauses.push(`GROUP_CONCAT(
        DISTINCT CONCAT(e.id, ':', e.name, ':', e.event_date, ':', COALESCE(e.start_time, ''), ':', COALESCE(e.event_type, ''))
      ) as upcoming_events`);
    }
    
    // Handle open_now filter (requires hours data)
    if (open_now === 'true') {
      if (!includeOptions.includes('hours')) {
        // Need to add the join before constructing the query
        joinClauses.push('LEFT JOIN bar_hours bh ON b.id = bh.bar_id');
        selectClauses.push(`GROUP_CONCAT(
          DISTINCT CONCAT(bh.day_of_week, ':', bh.open_time, ':', bh.close_time, ':', bh.is_closed)
        ) as hours`);
      }
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
    
    // Add HAVING clause for open_now filter
    if (open_now === 'true') {
      selectSql += ` HAVING (
        GROUP_CONCAT(DISTINCT CONCAT(bh.day_of_week, ':', bh.open_time, ':', bh.close_time, ':', bh.is_closed)) IS NOT NULL
        AND DAYOFWEEK(NOW()) - 1 IN (
          SELECT bh_check.day_of_week FROM bar_hours bh_check 
          WHERE bh_check.bar_id = b.id 
          AND bh_check.is_closed = 0
          AND TIME(NOW()) BETWEEN bh_check.open_time AND bh_check.close_time
        )
      )`;
    }
    
    selectSql += ` ORDER BY ${orderByClause}`;
    
    // Add pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;
    selectSql += ` LIMIT ? OFFSET ?`;
    params.push(limitNum, offset);
    
    const [rows] = await db.query(selectSql, params);
    
    // Parse the results based on what was included
    const bars = rows.map(bar => {
      const result = { ...bar };
      
      if (includeOptions.includes('hours') && bar.hours) {
        result.hours = bar.hours.split(',').map(h => {
          const [day_of_week, open_time, close_time, is_closed] = h.split(':');
          return {
            day_of_week: parseInt(day_of_week),
            open_time: open_time === 'null' ? null : open_time,
            close_time: close_time === 'null' ? null : close_time,
            is_closed: is_closed === '1'
          };
        });
      } else if (includeOptions.includes('hours')) {
        result.hours = [];
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
          const [id, name, event_date, start_time, event_type] = e.split(':');
          return {
            id,
            name,
            event_date,
            start_time: start_time || null,
            event_type: event_type || null
          };
        });
      } else if (includeOptions.includes('events')) {
        result.upcoming_events = [];
      }

      // Include distance information if location-based search was used
      if (lat && lon && bar.distance !== undefined) {
        result.distance = parseFloat(bar.distance.toFixed(2));
        result.distanceUnit = bar.distanceUnit;
      }
      
      return result;
    });
    
    return res.json({ 
      success: true, 
      data: bars,
      meta: {
        count: bars.length,
        page: pageNum,
        limit: limitNum,
        filters: { 
          tag, 
          open_now, 
          has_events, 
          lat, 
          lon, 
          radius: req.query.radius || (lat && lon ? '5' : null), 
          unit: req.query.unit || (lat && lon ? 'miles' : null) 
        },
        included: includeOptions
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
    if (includeOptions.includes('hours')) {
      joinClauses.push('LEFT JOIN bar_hours bh ON b.id = bh.bar_id');
      selectClauses.push(`GROUP_CONCAT(
        DISTINCT CONCAT(bh.day_of_week, ':', bh.open_time, ':', bh.close_time, ':', bh.is_closed)
      ) as hours`);
    }
    
    if (includeOptions.includes('tags')) {
      joinClauses.push('LEFT JOIN bar_tags bt ON b.id = bt.bar_id');
      joinClauses.push('LEFT JOIN tags t ON bt.tag_id = t.id');
      selectClauses.push(`GROUP_CONCAT(
        DISTINCT CONCAT(t.id, ':', t.name, ':', COALESCE(t.category, ''))
      ) as tags`);
    }
    
    if (includeOptions.includes('events')) {
      joinClauses.push(`LEFT JOIN events e ON b.id = e.bar_id 
        AND e.is_active = 1 
        AND e.event_date >= CURDATE()`);
      selectClauses.push(`GROUP_CONCAT(
        DISTINCT CONCAT(e.id, ':', e.name, ':', e.event_date, ':', COALESCE(e.start_time, ''), ':', COALESCE(e.event_type, ''))
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
    if (includeOptions.includes('hours') && bar.hours) {
      result.hours = bar.hours.split(',').map(h => {
        const [day_of_week, open_time, close_time, is_closed] = h.split(':');
        return {
          day_of_week: parseInt(day_of_week),
          open_time: open_time === 'null' ? null : open_time,
          close_time: close_time === 'null' ? null : close_time,
          is_closed: is_closed === '1'
        };
      });
    } else if (includeOptions.includes('hours')) {
      result.hours = [];
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
        const [id, name, event_date, start_time, event_type] = e.split(':');
        return {
          id,
          name,
          event_date,
          start_time: start_time || null,
          event_type: event_type || null
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
 * Updates an existing bar (protected route)
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
      
      // Update basic bar information
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
        barId
      ]);
      
      // Update hours if provided
      if (Array.isArray(payload.hours)) {
        // Delete existing hours
        await conn.execute(`DELETE FROM bar_hours WHERE bar_id = ?`, [barId]);
        
        // Insert new hours
        const insertHourSql = `INSERT INTO bar_hours (id, bar_id, day_of_week, open_time, close_time, is_closed) VALUES (?, ?, ?, ?, ?, ?)`;
        for (const h of payload.hours) {
          const hourId = uuidv4();
          await conn.execute(insertHourSql, [
            hourId,
            barId,
            h.day_of_week,
            h.open_time || null,
            h.close_time || null,
            h.is_closed ? 1 : 0
          ]);
        }
      }
      
      // Update tags if provided
      if (Array.isArray(payload.tag_ids)) {
        // Delete existing tag relationships
        await conn.execute(`DELETE FROM bar_tags WHERE bar_id = ?`, [barId]);
        
        // Insert new tag relationships
        const insertBarTagSql = `INSERT INTO bar_tags (bar_id, tag_id) VALUES (?, ?)`;
        for (const tagId of payload.tag_ids) {
          await conn.execute(insertBarTagSql, [barId, tagId]);
        }
      }
      
      await conn.commit();
      
      return res.json({ 
        success: true, 
        message: 'Bar updated successfully',
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
 * Lightweight search for bars by name (case-insensitive) - returns only essential data
 * Returns: bar UUID, name, and address information only
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

module.exports = {
  createBar,
  getAllBars,
  getBar,
  updateBar,
  deleteBar,
  searchBarsByName
};
