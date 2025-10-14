const db = require('../utils/db');
const { v4: uuidv4 } = require('uuid');

/**
 * GET /tags
 * Returns all tags from the database (id, name, category, time created).
 */
async function getAllTags(req, res) {
  try {
    const [rows] = await db.query('SELECT id, name, category, created_at FROM tags ORDER BY name');
    return res.json({ data: rows });
  } catch (err) {
    console.error('Error fetching tags:', err.message || err);
    return res.status(500).json({ error: 'Failed to fetch tags' });
  }
}

/**
 * POST /tags
 * Creates a new tag (protected route)
 * Expected payload: { name: string, category?: string }
 */
async function createTag(req, res) {
  try {
    const { name, category } = req.body;
    const userId = req.user.userId; // From JWT
    
    if (!name) {
      return res.status(400).json({ error: 'Tag name is required' });
    }
    
    const tagId = uuidv4();
    const insertSql = `INSERT INTO tags (id, name, category) VALUES (?, ?, ?)`;
    
    const [result] = await db.execute(insertSql, [
      tagId,
      name.trim(),
      category ? category.trim() : null
    ]);
    
    return res.status(201).json({
      success: true,
      message: 'Tag created successfully',
      data: { id: tagId, name: name.trim(), category: category || null }
    });
  } catch (err) {
    console.error('Error creating tag:', err.message || err);
    
    // Handle duplicate tag name error
    if (err && err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Tag name already exists' });
    }
    
    return res.status(500).json({ error: 'Failed to create tag' });
  }
}

/**
 * PUT /tags/:id
 * Updates an existing tag (protected route)
 */
async function updateTag(req, res) {
  try {
    const tagId = req.params.id;
    const { name, category } = req.body;
    const userId = req.user.userId; // From JWT
    
    if (!name) {
      return res.status(400).json({ error: 'Tag name is required' });
    }
    
    const updateSql = `UPDATE tags SET name = ?, category = ? WHERE id = ?`;
    const [result] = await db.execute(updateSql, [
      name.trim(),
      category ? category.trim() : null,
      tagId
    ]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Tag not found' });
    }
    
    return res.json({
      success: true,
      message: 'Tag updated successfully',
      data: { id: tagId, name: name.trim(), category: category || null }
    });
  } catch (err) {
    console.error('Error updating tag:', err.message || err);
    
    // Handle duplicate tag name error
    if (err && err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Tag name already exists' });
    }
    
    return res.status(500).json({ error: 'Failed to update tag' });
  }
}

/**
 * DELETE /tags/:id
 * Deletes a tag (protected route)
 * Only allows deletion if tag is not used by any bars
 */
async function deleteTag(req, res) {
  try {
    const tagId = req.params.id;
    const userId = req.user.userId; // From JWT
    
    // Check if tag is used by any bars
    const checkUsageSql = `SELECT COUNT(*) as count FROM bar_tags WHERE tag_id = ?`;
    const [usageRows] = await db.execute(checkUsageSql, [tagId]);
    
    if (usageRows[0].count > 0) {
      return res.status(409).json({ 
        error: 'Cannot delete tag: it is currently used by one or more bars' 
      });
    }
    
    const deleteSql = `DELETE FROM tags WHERE id = ?`;
    const [result] = await db.execute(deleteSql, [tagId]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Tag not found' });
    }
    
    return res.json({
      success: true,
      message: 'Tag deleted successfully',
      data: { id: tagId }
    });
  } catch (err) {
    console.error('Error deleting tag:', err.message || err);
    return res.status(500).json({ error: 'Failed to delete tag' });
  }
}

module.exports = {
  getAllTags,
  createTag,
  updateTag,
  deleteTag
};
