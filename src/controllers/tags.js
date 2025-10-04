const db = require('../utils/db');

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

module.exports = {
  getAllTags
};
