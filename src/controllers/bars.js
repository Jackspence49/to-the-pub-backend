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
 * GET /bars
 * Returns all active bars with their hours and tags
 */
async function getAllBars(req, res) {
  try {
    const selectSql = `
      SELECT 
        b.*,
        GROUP_CONCAT(
          DISTINCT CONCAT(bh.day_of_week, ':', bh.open_time, ':', bh.close_time, ':', bh.is_closed)
        ) as hours,
        GROUP_CONCAT(DISTINCT t.name) as tags
      FROM bars b
      LEFT JOIN bar_hours bh ON b.id = bh.bar_id
      LEFT JOIN bar_tags bt ON b.id = bt.bar_id
      LEFT JOIN tags t ON bt.tag_id = t.id
      WHERE b.is_active = 1
      GROUP BY b.id
      ORDER BY b.name
    `;
    
    const [rows] = await db.execute(selectSql);
    
    // Parse hours and tags for each bar
    const bars = rows.map(bar => ({
      ...bar,
      hours: bar.hours ? bar.hours.split(',').map(h => {
        const [day_of_week, open_time, close_time, is_closed] = h.split(':');
        return {
          day_of_week: parseInt(day_of_week),
          open_time,
          close_time,
          is_closed: is_closed === '1'
        };
      }) : [],
      tags: bar.tags ? bar.tags.split(',') : []
    }));
    
    return res.json({ success: true, data: bars });
  } catch (err) {
    console.error('Error fetching bars:', err.message || err);
    return res.status(500).json({ error: 'Failed to fetch bars' });
  }
}

/**
 * GET /bars/:id
 * Returns a single bar with full details
 */
async function getBar(req, res) {
  try {
    const barId = req.params.id;
    
    const selectSql = `
      SELECT 
        b.*,
        GROUP_CONCAT(
          DISTINCT CONCAT(bh.day_of_week, ':', bh.open_time, ':', bh.close_time, ':', bh.is_closed)
        ) as hours,
        GROUP_CONCAT(DISTINCT t.name) as tags
      FROM bars b
      LEFT JOIN bar_hours bh ON b.id = bh.bar_id
      LEFT JOIN bar_tags bt ON b.id = bt.bar_id
      LEFT JOIN tags t ON bt.tag_id = t.id
      WHERE b.id = ? AND b.is_active = 1
      GROUP BY b.id
    `;
    
    const [rows] = await db.execute(selectSql, [barId]);
    
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Bar not found' });
    }
    
    const bar = rows[0];
    
    // Parse hours and tags
    const result = {
      ...bar,
      hours: bar.hours ? bar.hours.split(',').map(h => {
        const [day_of_week, open_time, close_time, is_closed] = h.split(':');
        return {
          day_of_week: parseInt(day_of_week),
          open_time,
          close_time,
          is_closed: is_closed === '1'
        };
      }) : [],
      tags: bar.tags ? bar.tags.split(',') : []
    };
    
    return res.json({ success: true, data: result });
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

module.exports = {
  createBar,
  getAllBars,
  getBar,
  updateBar,
  deleteBar
};
