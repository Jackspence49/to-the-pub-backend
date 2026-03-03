const db = require('../utils/db');

/**
 * POST /users/:userId/bars/:barId
 * Assigns a web user to a bar. super_admin only.
 */
async function assignUserToBar(req, res) {
  const { userId, barId } = req.params;
  const assignedBy = req.user.userId;

  try {
    // Validate user exists
    const [userRows] = await db.execute('SELECT id FROM web_users WHERE id = ?', [userId]);
    if (userRows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Validate bar exists and is active
    const [barRows] = await db.execute('SELECT id FROM bars WHERE id = ? AND is_active = 1', [barId]);
    if (barRows.length === 0) {
      return res.status(404).json({ error: 'Bar not found' });
    }

    await db.execute(
      'INSERT INTO web_user_bar_associations (user_id, bar_id, assigned_by) VALUES (?, ?, ?)',
      [userId, barId, assignedBy]
    );

    return res.status(201).json({
      success: true,
      message: 'User assigned to bar successfully',
      data: { user_id: userId, bar_id: barId }
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'User is already assigned to this bar' });
    }
    console.error('Error assigning user to bar:', err.message || err);
    return res.status(500).json({ error: 'Failed to assign user to bar' });
  }
}

/**
 * DELETE /users/:userId/bars/:barId
 * Removes a web user's assignment to a bar. super_admin only.
 */
async function unassignUserFromBar(req, res) {
  const { userId, barId } = req.params;

  try {
    const [result] = await db.execute(
      'DELETE FROM web_user_bar_associations WHERE user_id = ? AND bar_id = ?',
      [userId, barId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Association not found' });
    }

    return res.json({
      success: true,
      message: 'User unassigned from bar successfully',
      data: { user_id: userId, bar_id: barId }
    });
  } catch (err) {
    console.error('Error unassigning user from bar:', err.message || err);
    return res.status(500).json({ error: 'Failed to unassign user from bar' });
  }
}

/**
 * GET /users/:userId/bars
 * Returns all bars assigned to a user. super_admin or the user themselves.
 */
async function getUserBars(req, res) {
  const { userId } = req.params;
  const requestingUser = req.user;

  if (requestingUser.role !== 'super_admin' && requestingUser.userId !== userId) {
    return res.status(403).json({ error: 'Access denied.' });
  }

  try {
    const [rows] = await db.execute(
      `SELECT b.id, b.name, b.address_street, b.address_city, b.address_state, b.address_zip,
              a.assigned_at, a.assigned_by
       FROM web_user_bar_associations a
       INNER JOIN bars b ON a.bar_id = b.id
       WHERE a.user_id = ? AND b.is_active = 1
       ORDER BY b.name`,
      [userId]
    );

    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Error fetching user bars:', err.message || err);
    return res.status(500).json({ error: 'Failed to fetch user bars' });
  }
}

/**
 * GET /bars/:barId/users
 * Returns all users assigned to a bar. super_admin only.
 */
async function getBarUsers(req, res) {
  const { barId } = req.params;

  try {
    const [barRows] = await db.execute('SELECT id FROM bars WHERE id = ? AND is_active = 1', [barId]);
    if (barRows.length === 0) {
      return res.status(404).json({ error: 'Bar not found' });
    }

    const [rows] = await db.execute(
      `SELECT u.id, u.email, u.full_name, u.role, a.assigned_at, a.assigned_by
       FROM web_user_bar_associations a
       INNER JOIN web_users u ON a.user_id = u.id
       WHERE a.bar_id = ?
       ORDER BY u.full_name`,
      [barId]
    );

    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Error fetching bar users:', err.message || err);
    return res.status(500).json({ error: 'Failed to fetch bar users' });
  }
}

module.exports = {
  assignUserToBar,
  unassignUserFromBar,
  getUserBars,
  getBarUsers
};
