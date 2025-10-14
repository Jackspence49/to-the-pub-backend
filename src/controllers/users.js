const db = require('../utils/db');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

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

/**
 * Login payload expected:
 * { email: string, password: string }
 *
 * Returns 200 with JWT token and user info on success, 401 on invalid creds
 */
async function login(req, res) {
  const payload = req.body;
  if (!payload || !payload.email || !payload.password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const email = payload.email.trim().toLowerCase();
  const password = payload.password;

  try {
    // Look up user by email (username field is treated as email)
    const selectSql = `SELECT id, email, password_hash, full_name, role FROM web_users WHERE email = ? LIMIT 1`;
    
    const [rows] = await db.execute(selectSql, [email]);
    if (!rows || rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = rows[0];
    
    // Compare the received password with the stored hashed password using bcrypt.compare()
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Create JWT token with user ID and role information
    const jwtPayload = {
      userId: user.id,
      email: user.email,
      role: user.role
    };

    const token = jwt.sign(jwtPayload, process.env.JWT_SECRET, { 
      expiresIn: '24h' 
    });

    // Send the JWT back in the response along with user info
    return res.status(200).json({ 
      data: { 
        id: user.id, 
        email: user.email, 
        full_name: user.full_name, 
        role: user.role 
      },
      token: token
    });
  } catch (err) {
    console.error('Error logging in:', err.message || err);
    return res.status(500).json({ error: 'Login failed' });
  }
}

/**
 * Get current user profile (protected route)
 * Requires authentication middleware to populate req.user
 */
async function getProfile(req, res) {
  try {
    const userId = req.user.userId; // From JWT payload
    
    const selectSql = `SELECT id, email, full_name, role, created_at FROM web_users WHERE id = ? LIMIT 1`;
    const [rows] = await db.execute(selectSql, [userId]);
    
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = rows[0];
    return res.status(200).json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        created_at: user.created_at
      }
    });
  } catch (err) {
    console.error('Error getting user profile:', err.message || err);
    return res.status(500).json({ error: 'Failed to get user profile' });
  }
}

/**
 * Update user profile (protected route)
 * Allows users to update their full_name
 */
async function updateProfile(req, res) {
  try {
    const userId = req.user.userId; // From JWT payload
    const { full_name } = req.body;
    
    if (!full_name) {
      return res.status(400).json({ error: 'full_name is required' });
    }
    
    const updateSql = `UPDATE web_users SET full_name = ? WHERE id = ?`;
    const [result] = await db.execute(updateSql, [full_name, userId]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: { id: userId, full_name }
    });
  } catch (err) {
    console.error('Error updating user profile:', err.message || err);
    return res.status(500).json({ error: 'Failed to update user profile' });
  }
}

module.exports = { signup, login, getProfile, updateProfile };
