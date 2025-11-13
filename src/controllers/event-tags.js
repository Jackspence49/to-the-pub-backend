const db = require('../utils/db');
const { v4: uuidv4 } = require('uuid');

/**
 * GET /event-tags
 * Returns all event tags from the database (id, name, time created).
 */
async function getAllEventTags(req, res) {
  try {
    const [rows] = await db.query('SELECT id, name, created_at FROM event_tags ORDER BY name');
    return res.json({ data: rows });
  } catch (err) {
    console.error('Error fetching event tags:', err.message || err);
    return res.status(500).json({ error: 'Failed to fetch event tags' });
  }
}

/**
 * POST /event-tags
 * Creates a new event tag (protected route)
 * Expected payload: { name: string }
 */
async function createEventTag(req, res) {
  try {
    const { name } = req.body;
    const userId = req.user.userId; // From JWT
    
    if (!name) {
      return res.status(400).json({ error: 'Tag name is required' });
    }
    
    const tagId = uuidv4();
    const insertSql = `INSERT INTO event_tags (id, name) VALUES (?, ?)`;
    
    const [result] = await db.execute(insertSql, [
      tagId,
      name.trim()
    ]);
    
    return res.status(201).json({
      success: true,
      message: 'Event tag created successfully',
      data: { id: tagId, name: name.trim() }
    });
  } catch (err) {
    console.error('Error creating event tag:', err.message || err);
    
    // Handle duplicate tag name error
    if (err && err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Event tag name already exists' });
    }
    
    return res.status(500).json({ error: 'Failed to create event tag' });
  }
}

/**
 * PUT /event-tags/:id
 * Updates an existing event tag (protected route)
 */
async function updateEventTag(req, res) {
  try {
    const tagId = req.params.id;
    const { name } = req.body;
    const userId = req.user.userId; // From JWT
    
    if (!name) {
      return res.status(400).json({ error: 'Tag name is required' });
    }
    
    const updateSql = `UPDATE event_tags SET name = ? WHERE id = ?`;
    const [result] = await db.execute(updateSql, [
      name.trim(),
      tagId
    ]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Event tag not found' });
    }
    
    return res.json({
      success: true,
      message: 'Event tag updated successfully',
      data: { id: tagId, name: name.trim() }
    });
  } catch (err) {
    console.error('Error updating event tag:', err.message || err);
    
    // Handle duplicate tag name error
    if (err && err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Event tag name already exists' });
    }
    
    return res.status(500).json({ error: 'Failed to update event tag' });
  }
}

/**
 * DELETE /event-tags/:id
 * Deletes an event tag (protected route)
 * Only allows deletion if tag is not used by any events
 */
async function deleteEventTag(req, res) {
  try {
    const tagId = req.params.id;
    const userId = req.user.userId; // From JWT
    
    // Check if tag is used by any events
    const checkUsageSql = `SELECT COUNT(*) as count FROM events WHERE event_tag_id = ?`;
    const [usageRows] = await db.execute(checkUsageSql, [tagId]);
    
    if (usageRows[0].count > 0) {
      return res.status(409).json({ 
        error: 'Cannot delete event tag: it is currently used by one or more events' 
      });
    }
    
    const deleteSql = `DELETE FROM event_tags WHERE id = ?`;
    const [result] = await db.execute(deleteSql, [tagId]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Event tag not found' });
    }
    
    return res.json({
      success: true,
      message: 'Event tag deleted successfully',
      data: { id: tagId }
    });
  } catch (err) {
    console.error('Error deleting event tag:', err.message || err);
    return res.status(500).json({ error: 'Failed to delete event tag' });
  }
}









module.exports = {
  getAllEventTags,
  createEventTag,
  updateEventTag,
  deleteEventTag,
};