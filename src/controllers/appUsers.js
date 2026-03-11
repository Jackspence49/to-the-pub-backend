const crypto = require('crypto');
const db = require('../utils/db');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const { MIN_PASSWORD_LENGTH, SALT_ROUNDS, DUMMY_HASH } = require('../utils/constants');
const { normalizeEmail, isValidEmail, isValidPassword, formatPhoneForDB, isValidPhone } = require('../utils/user');
const { ensureAppUserToken } = require('../middleware/token');
const { buildAppUserToken } = require('../utils/token');
const { sendPasswordResetEmail } = require('../utils/email');

// Register function for app users
async function register(req, res) {
  // 1. Destructure with default empty object
  const { email, password, full_name, phone } = req.body || {};

  // 2. Initial presence check for required fields
  if (!email || !password || !full_name) {
    return res.status(400).json({ error: 'Email, password, and full name are required' });
  }

  // 3. Normalize and Validate 
  const normalizedEmail = normalizeEmail(email);
  if (!isValidEmail(normalizedEmail)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  if (password.length < MIN_PASSWORD_LENGTH || !isValidPassword(password)) {
    return res.status(400).json({ error: 'Password does not meet complexity requirements' });
  }

  const normalizedPhone = phone ? formatPhoneForDB(phone) : null;
  if (phone && !isValidPhone(normalizedPhone)) {
    return res.status(400).json({ error: 'Invalid phone number format' });
  }

  try {
    // 4. Secure Hashing & ID generation
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS); 
    const userId = uuidv4();

    const insertSql = `
      INSERT INTO app_users (id, email, password_hash, full_name, phone)
      VALUES (?, ?, ?, ?, ?)
    `;

    // 5. Database Execution
    await db.execute(insertSql, [
      userId,
      normalizedEmail,
      passwordHash,
      full_name,
      normalizedPhone || null
    ]);

    // 6. Token Generation (Your helper)
    const token = buildAppUserToken({ id: userId, email: normalizedEmail });

    // 7. Success Response (201 Created)
    return res.status(201).json({
      message: "User created successfully",
      data: {
        id: userId,
        email: normalizedEmail,
        full_name,
        phone: normalizedPhone || null
      },
      token
    });

  } catch (err) {
    console.error('Registration Error:', err);

    // Handle DB Duplicates (409 Conflict)
    if (err.code === 'ER_DUP_ENTRY' || err.errno === 1062) {
      return res.status(409).json({ error: 'Email or phone already registered' });
    }

    return res.status(500).json({ error: 'Internal server error' });
  }
}

// Login function for app users
async function login(req, res) {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const normalizedEmail = normalizeEmail(email);

  try {
    const selectSql = `
      SELECT id, email, password_hash, full_name
      FROM app_users
      WHERE email = ?
      LIMIT 1
    `;

    const [rows] = await db.execute(selectSql, [normalizedEmail]);
    const user = rows[0];

    // 2. Generic Error Message to prevent enumeration
    const genericError = 'Invalid email address or password';

    if (!user) {
      // Still need to call bcrypt to prevent time-based attacks
      await bcrypt.compare(password, DUMMY_HASH);
      return res.status(401).json({ error: genericError });
    }

    // 3. Password Check
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      req.recordFailedLogin?.();
      return res.status(401).json({ error: genericError });
    }

    // 5. Success Path
    await db.execute('UPDATE app_users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);
    req.clearFailedLogins?.();

    const token = buildAppUserToken({ id: user.id, email: user.email });

    return res.status(200).json({
      data: {
        id: user.id,
        email: user.email,
        full_name: user.full_name
      },
      token
    });
  } catch (err) {
    console.error('Error logging in app user:', err);
    return res.status(500).json({ error: 'Failed to login' });
  }
}

// Get profile function for app users
async function getProfile(req, res) {
  // Authenticate Request
  if (!ensureAppUserToken(req, res)) {
    return; 
  }

  try {
    const selectSql = `
      SELECT id, email, full_name, phone, last_login, created_at
      FROM app_users
      WHERE id = ?
      LIMIT 1
    `;

    const [rows] = await db.execute(selectSql, [req.user.userId]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'App user not found' });
    }

    const user = rows[0];

    // 3. Return Sanitized Data
    return res.status(200).json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        // Use empty string fallback for null values to keep frontend code clean
        phone: user.phone || '',
        last_login: user.last_login,
        created_at: user.created_at
      }
    });
  } catch (err) {
    console.error('Error fetching app user profile:', err);
    return res.status(500).json({ error: 'Failed to fetch profile' });
  }
}

// Update profile function for app users
async function updateProfile(req, res) {
  // Authenticate Request
  if (!ensureAppUserToken(req, res)) {
    return;
  }

  const { full_name, phone, new_password } = req.body || {};

  // Ensure at least one field is provided
  if (full_name === undefined && phone === undefined && !new_password) {
    return res.status(400).json({ error: 'No profile fields supplied' });
  }

  // Validate New Password Complexity
  if (new_password && !isValidPassword(new_password)) {
    return res.status(400).json({ error: 'Password does not meet complexity requirements' });
  }

  // Validate and Format Phone Number
  let formattedPhone = phone;
  if (phone !== undefined) {
    if (phone === null) {
      formattedPhone = null;
    } else {
      formattedPhone = formatPhoneForDB(phone);
      if (!isValidPhone(formattedPhone)) {
        return res.status(400).json({ error: 'Invalid phone number format. Please use E.164 format (e.g., +15551234567)' });
      }
    }
  }

  try {
    const updates = [];
    const params = [];

    // Dynamically build SQL SET clause
    if (full_name !== undefined) {
      updates.push('full_name = ?');
      params.push(full_name || null);
    }

    if (formattedPhone !== undefined) {
      updates.push('phone = ?');
      params.push(formattedPhone);
    }

    if (new_password) {
      const newHash = await bcrypt.hash(new_password, 12);
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

    // 5. Execute Update
    const [result] = await db.execute(updateSql, params);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'App user not found or inactive' });
    }

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully'
    });
  } catch (err) {
    console.error('Error updating app user profile:', err);
    
    // 6. Handle Database Constraints (e.g., Duplicate Phone)
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Phone number already registered' });
    }
    
    return res.status(500).json({ error: 'Failed to update profile' });
  }
}

// Forgot password function for app users
async function forgotPassword(req, res) {
  const { email } = req.body || {};

  // Validate presence of email
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  const normalizedEmail = normalizeEmail(email);

  try {
    // 1. Find user by email and ensure they are active
    const selectSql = `
    SELECT id FROM app_users 
    WHERE email = ? AND is_active = 1 
    LIMIT 1
    `;
    const [rows] = await db.execute(selectSql, [normalizedEmail]);

    // 2. Always respond with success message to prevent email enumeration
    if (!rows || rows.length === 0) {
      return res.status(200).json({ success: true, message: 'If the account exists, a reset link has been sent.' });
    }

    const user = rows[0];
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000);

    // 3. Store reset token and expiration in the database
    await db.execute(
      'UPDATE app_users SET reset_token = ?, reset_token_expires = ? WHERE id = ?',
      [resetToken, expires, user.id]
    );

    // 4. Send password reset email (log error but do not fail the request)
    try {
      await sendPasswordResetEmail(normalizedEmail, resetToken);
    } catch (emailErr) {
      console.error('Error sending password reset email:', emailErr.message || emailErr);
    }

    // 5. Respond with generic success message
    return res.status(200).json({
      success: true,
      message: 'If the account exists, a reset link has been sent.'
    });
  } 
  // 6. Log any unexpected errors and return generic message
  catch (err) {
    console.error('Error initiating app user password reset:', err.message || err);
    return res.status(500).json({ error: 'Failed to initiate password reset' });
  }
}

// Reset password function for app users
async function resetPassword(req, res) {
  const { token, newPassword } = req.body || {};

  //Validate presence of token and new password
  if (!token || !newPassword) {
    return res.status(400).json({ error: 'Token and new password are required' });
  }

  //Validate new password complexity
  if (newPassword.length < MIN_PASSWORD_LENGTH || !isValidPassword(newPassword)) {
    return res.status(400).json({ error: 'Password does not meet complexity requirements' });
  }

  try {
    // 1. Find user by token and ensure it's not expired
    const selectSql = `
      SELECT id FROM app_users
      WHERE reset_token = ? AND reset_token_expires > NOW()
      LIMIT 1
    `;

    const [rows] = await db.execute(selectSql, [token]);

    //2. Prevent timing attacks by always calling bcrypt, even if token is invalid
    if (!rows || rows.length === 0) {
      await bcrypt.compare('some_dummy_hash', SALT_ROUNDS);
      return res.status(401).json({ error: 'Invalid or expired reset token' });
    }

    const user = rows[0];

    // 3. Hash the new password
    const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    // 4. Update user's password and clear reset token
    const updateSql = `
      UPDATE app_users
      SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL
      WHERE id = ?
    `;

    await db.execute(updateSql, [newHash, user.id]);

    return res.status(200).json({ 
      success: true, 
      message: 'Password reset successfully' });
  } catch (err) {
    // 5. Log error and return generic message
    console.error('Error resetting app user password:', err);
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
