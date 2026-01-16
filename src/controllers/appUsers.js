const db = require('../utils/db');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const MIN_PASSWORD_LENGTH = 8;
const SALT_ROUNDS = 10;

const normalizeEmail = (email = '') => email.trim().toLowerCase();

const ensureAppUserToken = (req, res) => {
  if (!req.user || req.user.userType !== 'app_user') {
    res.status(403).json({ error: 'App user authentication required' });
    return false;
  }
  return true;
};

const buildToken = ({ id, email }) => jwt.sign(
  {
    userId: id,
    email,
    userType: 'app_user'
  },
  process.env.JWT_SECRET,
  { expiresIn: '7d' }
);

async function register(req, res) {
  const { email, password, full_name } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return res.status(422).json({ error: 'password must be at least 8 characters' });
  }

  const normalizedEmail = normalizeEmail(email);

  try {
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const userId = uuidv4();

    const insertSql = `
      INSERT INTO app_users (id, email, password_hash, full_name)
      VALUES (?, ?, ?, ?)
    `;

    await db.execute(insertSql, [
      userId,
      normalizedEmail,
      passwordHash,
      full_name || null
    ]);

    const token = buildToken({ id: userId, email: normalizedEmail });

    return res.status(201).json({
      data: {
        id: userId,
        email: normalizedEmail,
        full_name: full_name || null
      },
      token
    });
  } catch (err) {
    console.error('Error registering app user:', err.message || err);
    if (err && err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Email already registered' });
    }
    return res.status(500).json({ error: 'Failed to register app user' });
  }
}

async function login(req, res) {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const normalizedEmail = normalizeEmail(email);

  try {
    const selectSql = `
      SELECT id, email, password_hash, full_name, is_active
      FROM app_users
      WHERE email = ?
      LIMIT 1
    `;

    const [rows] = await db.execute(selectSql, [normalizedEmail]);

    if (!rows || rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = rows[0];

    if (!user.is_active) {
      return res.status(403).json({ error: 'Account is inactive' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    await db.execute('UPDATE app_users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);

    const token = buildToken({ id: user.id, email: user.email });

    return res.status(200).json({
      data: {
        id: user.id,
        email: user.email,
        full_name: user.full_name || null
      },
      token
    });
  } catch (err) {
    console.error('Error logging in app user:', err.message || err);
    return res.status(500).json({ error: 'Failed to login' });
  }
}

async function getProfile(req, res) {
  if (!ensureAppUserToken(req, res)) {
    return;
  }

  try {
    const selectSql = `
      SELECT id, email, full_name, phone, last_login, created_at
      FROM app_users
      WHERE id = ? AND is_active = 1
      LIMIT 1
    `;

    const [rows] = await db.execute(selectSql, [req.user.userId]);

    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'App user not found' });
    }

    const user = rows[0];

    return res.status(200).json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        phone: user.phone,
        last_login: user.last_login,
        created_at: user.created_at
      }
    });
  } catch (err) {
    console.error('Error fetching app user profile:', err.message || err);
    return res.status(500).json({ error: 'Failed to fetch profile' });
  }
}

async function updateProfile(req, res) {
  if (!ensureAppUserToken(req, res)) {
    return;
  }

  const { full_name, phone, new_password } = req.body || {};

  if (full_name === undefined && phone === undefined && !new_password) {
    return res.status(400).json({ error: 'No profile fields supplied' });
  }

  if (new_password && new_password.length < MIN_PASSWORD_LENGTH) {
    return res.status(422).json({ error: 'password must be at least 8 characters' });
  }

  try {
    const updates = [];
    const params = [];

    if (full_name !== undefined) {
      updates.push('full_name = ?');
      params.push(full_name || null);
    }

    if (phone !== undefined) {
      updates.push('phone = ?');
      params.push(phone || null);
    }

    if (new_password) {
      const newHash = await bcrypt.hash(new_password, SALT_ROUNDS);
      updates.push('password_hash = ?');
      params.push(newHash);
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');

    const updateSql = `
      UPDATE app_users
      SET ${updates.join(', ')}
      WHERE id = ? AND is_active = 1
    `;

    params.push(req.user.userId);

    const [result] = await db.execute(updateSql, params);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'App user not found' });
    }

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully'
    });
  } catch (err) {
    console.error('Error updating app user profile:', err.message || err);
    return res.status(500).json({ error: 'Failed to update profile' });
  }
}

async function forgotPassword(req, res) {
  const { email } = req.body || {};

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  const normalizedEmail = normalizeEmail(email);

  try {
    const selectSql = `SELECT id FROM app_users WHERE email = ? AND is_active = 1 LIMIT 1`;
    const [rows] = await db.execute(selectSql, [normalizedEmail]);

    if (!rows || rows.length === 0) {
      return res.status(200).json({ success: true, message: 'If the account exists, a reset link has been sent.' });
    }

    const user = rows[0];
    const resetToken = `${uuidv4()}-${Date.now()}`;
    const expires = new Date(Date.now() + 60 * 60 * 1000);

    await db.execute(
      'UPDATE app_users SET reset_token = ?, reset_token_expires = ? WHERE id = ?',
      [resetToken, expires, user.id]
    );

    return res.status(200).json({
      success: true,
      message: 'Password reset initiated',
      resetToken
    });
  } catch (err) {
    console.error('Error initiating app user password reset:', err.message || err);
    return res.status(500).json({ error: 'Failed to initiate password reset' });
  }
}

async function resetPassword(req, res) {
  const { token, newPassword } = req.body || {};

  if (!token || !newPassword) {
    return res.status(400).json({ error: 'Token and new password are required' });
  }

  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return res.status(422).json({ error: 'Password must be at least 8 characters' });
  }

  try {
    const selectSql = `
      SELECT id FROM app_users
      WHERE reset_token = ? AND reset_token_expires > NOW()
      LIMIT 1
    `;

    const [rows] = await db.execute(selectSql, [token]);

    if (!rows || rows.length === 0) {
      return res.status(401).json({ error: 'Invalid or expired reset token' });
    }

    const user = rows[0];
    const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    const updateSql = `
      UPDATE app_users
      SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL
      WHERE id = ?
    `;

    await db.execute(updateSql, [newHash, user.id]);

    return res.status(200).json({ success: true, message: 'Password reset successfully' });
  } catch (err) {
    console.error('Error resetting app user password:', err.message || err);
    return res.status(500).json({ error: 'Failed to reset password' });
  }
}

module.exports = {
  register,
  login,
  getProfile,
  updateProfile,
  forgotPassword,
  resetPassword
};
