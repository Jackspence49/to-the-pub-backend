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

module.exports = {
  createBar
};
