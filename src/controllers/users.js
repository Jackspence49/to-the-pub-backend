const db = require('../utils/db');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

/**
 * Signup payload expected:
 * {
 *   email: string,
 *   password: string,
 *   full_name?: string
 * }
 *
 * This endpoint will create a new web_users row with role 'super_admin'.
 * Role is set on the backend to avoid trusting the client.
 */
async function signup(req, res) {
  const payload = req.body;
  if (!payload || !payload.email || !payload.password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const email = payload.email.trim().toLowerCase();
  const password = payload.password;
  const fullName = payload.full_name || null;

  // Basic validation
  if (password.length < 8) {
    return res.status(400).json({ error: 'password must be at least 8 characters' });
  }

  // Hash the password
  const saltRounds = 10;
  const passwordHash = await bcrypt.hash(password, saltRounds);

  const userId = uuidv4();
  const role = 'super_admin';

  const insertSql = `INSERT INTO web_users (id, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)`;
  try {
    const [result] = await db.execute(insertSql, [userId, email, passwordHash, fullName, role]);
    return res.status(201).json({ data: { id: userId, email, full_name: fullName, role } });
  } catch (err) {
    console.error('Error creating user:', err.message || err);
    // Handle duplicate email error (MySQL ER_DUP_ENTRY)
    if (err && err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Email already exists' });
    }
    return res.status(500).json({ error: 'Failed to create user' });
  }
}

module.exports = { signup };
