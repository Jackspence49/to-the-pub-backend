const crypto = require('crypto');
const db = require('../utils/db');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const { MIN_PASSWORD_LENGTH, SALT_ROUNDS, DUMMY_HASH } = require('../utils/constants');
const { normalizeEmail, isValidEmail, isValidPassword, isValidRole, isValidFullName, normalizeFullName } = require('../utils/user');
const { buildWebUserToken } = require('../utils/token');
const { ensureWebUserToken } = require('../middleware/token')

const { sendPasswordResetEmail } = require('../utils/email');
const jwt = require('jsonwebtoken');

// Admin signup function Expected payload: {email: string, password: string, full_name?: string}
async function signup(req, res) {
  // 1. Destructure with default empty object
  const { email, password, full_name } = req.body || {};

  // 2. Initial presence check for required fields
  if (!email || !password || !full_name) {
    return res.status(400).json({ error: 'Email, password, and full_name are required' });
  }

  // 3. Normalize and Validate 
  const normalizedEmail = normalizeEmail(email);
  if (!isValidEmail(normalizedEmail)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  if (password.length < MIN_PASSWORD_LENGTH || !isValidPassword(password)) {
    return res.status(400).json({ error: 'Password does not meet complexity requirements' });
  }

  if (!isValidFullName(full_name)) {
      return res.status(400).json({ error: 'Invalid full name. Must be 2–100 characters and contain only letters, spaces, hyphens, or apostrophes.' });
  }

  try {
    //Seting role Hasing and ID Generation
    const userId = uuidv4();
    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
    const role = 'admin';

    const insertSql = `
      INSERT INTO web_users (id, email, password_hash, full_name, role) 
      VALUES (?, ?, ?, ?, ?)
    `;

    // 5. Database Execution
    await db.execute(insertSql, [
      userId, 
      normalizedEmail, 
      password_hash, 
      full_name, 
      role
    ]);

  // 6. Token Generation
  const token = buildWebUserToken({ id: userId, email: normalizedEmail, role });

  //7. Sucess Reponse 
    return res.status(201).json({ 
      message: "Web Admin Created Successfully",
      data: 
      { 
        id: userId, 
        email: normalizedEmail, 
        full_name, 
        role 
      },
    token
   });

  } catch (err) {
    console.error('Registration Error:', err);

    // Handle DB Duplicates (409 Conflict)
    if (err.code === 'ER_DUP_ENTRY' || err.errno === 1062) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    return res.status(500).json({ error: 'Internal server error' });
  }
}

//Login payload expected: { email: string, password: string }
async function login(req, res) {
  const {email, password} = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const normalizedEmail = normalizeEmail(email);

  try {
    const selectSql = `
    SELECT id, email, password_hash, full_name, role
    FROM web_users 
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
    await db.execute(
      'UPDATE web_users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);
    req.clearFailedLogins?.();

    const token = buildWebUserToken({ id: user.id, email: user.email, role: user.role });

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

//Get current user profile (protected route)
async function getProfile(req, res) {
  if (!ensureWebUserToken(req, res)) {
  return; 
  }

  try {
    const selectSql = `
    SELECT id, email, full_name, role, last_login, created_at
    FROM web_users
    WHERE id = ?
    LIMIT 1`;

    const [rows] = await db.execute(selectSql, [req.user.userId]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Web user not found' });
    }

    const user = rows[0]

    return res.status(200).json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        last_login: user.last_login,
        created_at: user.created_at
      }
    });
  } catch (err) {
    console.error('Error fetching Web user profile:', err);
    return res.status(500).json({ error: 'Failed to fetch profile' });
  }
}

//Update user profile (protected route)
async function updateProfile(req, res) {
  if (!ensureWebUserToken(req, res)) {
  return; 
  }

  const {email, full_name, new_password } = req.body || {};

  if (full_name === undefined && !new_password && !email)  {
    return res.status(400).json({ error: 'No profile fields supplied' });
  }

    // Validate full_name if provided
  if (full_name !== undefined && full_name !== null) {
    if (!isValidFullName(full_name)) {
      return res.status(400).json({ error: 'Invalid full name. Must be 2–100 characters and contain only letters, spaces, hyphens, or apostrophes.' });
    }
  }

  if (new_password) {
    if (new_password.length < MIN_PASSWORD_LENGTH || !isValidPassword(new_password)) {
      return res.status(400).json({ error: 'Password does not meet complexity requirements' });
    }
  }

  let normalizedEmail;
  if (email) {
    normalizedEmail = normalizeEmail(email);
    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
  }

  try {
    const updates = [];
    const params = [];
    const updatedFields = [];

    if (normalizedEmail) {
      updates.push('email = ?');
      params.push(normalizedEmail);
      updatedFields.push('email');
    }

    if (full_name !== undefined) {
      updates.push('full_name = ?');
      params.push(full_name != null ? normalizeFullName(full_name) : null);
      updatedFields.push('full_name');
    }

    if (new_password) {
        const newHash = await bcrypt.hash(new_password, SALT_ROUNDS);
        updates.push('password_hash = ?');
        params.push(newHash);
        updatedFields.push('password');
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');

    const updateSql = `
      UPDATE web_users
      SET ${updates.join(', ')}
      WHERE id = ?
    `;

    params.push(req.user.userId);

    const [result] = await db.execute(updateSql, params)

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Web user not found or inactive' });
    }

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      updatedFields
    });
  } catch (err) {
    console.error('Error updating app user profile:', err);

    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Email already registered' });
    }

    return res.status(500).json({ error: 'Failed to update profile' });
  }
}

// Delete user by UUID (protected route)
// Only the account owner or an admin may delete an account.
async function deleteUser(req, res) {
  if (!ensureWebUserToken(req, res)) return;

  const { id } = req.params;

  const isSelf = req.user.userId === id;
  const isAdmin = req.user.role === 'admin';

  if (!isSelf && !isAdmin) {
    return res.status(403).json({ error: 'Access denied. You can only delete your own account.' });
  }

  try {
    const [rows] = await db.execute(
      `SELECT id, email FROM web_users WHERE id = ? LIMIT 1`,
      [id]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userToDelete = rows[0];

    await db.execute(`DELETE FROM web_user_bar_associations WHERE user_id = ?`, [id]);

    const [result] = await db.execute(`DELETE FROM web_users WHERE id = ?`, [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.status(200).json({
      success: true,
      message: 'User deleted successfully',
      data: {
        id: userToDelete.id,
        email: userToDelete.email
      }
    });
  } catch (err) {
    console.error('Error deleting user:', err.message || err);
    return res.status(500).json({ error: 'Failed to delete user' });
  }
}

//Initiate password reset (public route) Payload expected: { email: string }
async function forgotPassword(req, res) {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    const normalizedEmail = email.trim().toLowerCase();
    
    // Check if user exists
    const selectSql = `SELECT id, email FROM web_users WHERE email = ? LIMIT 1`;
    const [rows] = await db.execute(selectSql, [normalizedEmail]);
    
    if (!rows || rows.length === 0) {
      // Don't reveal whether email exists or not for security
      return res.status(200).json({ 
        success: true, 
        message: 'If the email exists, a password reset link has been sent' 
      });
    }
    
    const user = rows[0];
    
    // Generate a secure reset token
    const resetToken = uuidv4() + '-' + Date.now();
    
    // Set expiration time (1 hour from now)
    const expirationTime = new Date();
    expirationTime.setHours(expirationTime.getHours() + 1);
    
    // Store the reset token in the database
    const updateSql = `UPDATE web_users SET reset_token = ?, reset_token_expires = ? WHERE id = ?`;
    await db.execute(updateSql, [resetToken, expirationTime, user.id]);
    
    // In production, you would send an email here instead of returning the token
    // For testing purposes, we return the token in the response
    return res.status(200).json({
      success: true,
      message: 'Password reset initiated successfully',
      // Remove this in production - only for testing
      resetToken: resetToken
    });
    
  } catch (err) {
    console.error('Error initiating password reset:', err.message || err);
    return res.status(500).json({ error: 'Failed to initiate password reset' });
  }
}

//Reset password using token (public route) Payload expected: { token: string, newPassword: string }
async function resetPassword(req, res) {
  try {
    const { token, newPassword } = req.body;
    
    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }
    
    // Validate password length
    if (newPassword.length < 8) {
      return res.status(422).json({ error: 'Password must be at least 8 characters' });
    }
    
    // Find user with valid reset token that hasn't expired
    const selectSql = `
      SELECT id, email, reset_token, reset_token_expires 
      FROM web_users 
      WHERE reset_token = ? AND reset_token_expires > NOW() 
      LIMIT 1
    `;
    
    const [rows] = await db.execute(selectSql, [token]);
    
    if (!rows || rows.length === 0) {
      return res.status(401).json({ error: 'Invalid or expired reset token' });
    }
    
    const user = rows[0];
    
    // Hash the new password
    const saltRounds = 10;
    const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);
    
    // Update password and clear reset token
    const updateSql = `
      UPDATE web_users 
      SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL 
      WHERE id = ?
    `;
    
    await db.execute(updateSql, [newPasswordHash, user.id]);
    
    return res.status(200).json({
      success: true,
      message: 'Password reset successfully'
    });
    
  } catch (err) {
    console.error('Error resetting password:', err.message || err);
    return res.status(500).json({ error: 'Failed to reset password' });
  }
}

// Create a non-admin web user (admin only) Expected payload: {email: string, password: string, full_name: string}
async function createUser(req, res) {
  const { email, password, full_name, role } = req.body || {};

  if (!email || !password || !full_name || !role) {
    return res.status(400).json({ error: 'Email, password, full_name, and role are required' });
  }

  const normalizedEmail = normalizeEmail(email);
  if (!isValidEmail(normalizedEmail)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  if (password.length < MIN_PASSWORD_LENGTH || !isValidPassword(password)) {
    return res.status(400).json({ error: 'Password does not meet complexity requirements' });
  }

  if (!isValidRole(role)){
    return res.status(400).json ({ error: 'Role needs to be admin, venue_owner, manager, or staff'})
  }

  if (!isValidFullName(full_name)) {
      return res.status(400).json({ error: 'Invalid full name. Must be 2–100 characters and contain only letters, spaces, hyphens, or apostrophes.' });
  }

  try {
    const userId = uuidv4();
    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

    const insertSql = 
    `INSERT INTO web_users (id, email, password_hash, full_name, role) 
    VALUES (?, ?, ?, ?, ?)
    `;

    await db.execute(insertSql, [
      userId, 
      normalizedEmail, 
      password_hash, 
      full_name, 
      role
    ]);

    const token = buildWebUserToken({ id: userId, email: normalizedEmail });

    return res.status(201).json({ 
      message: "User created successfully",
      data: { 
        id: userId, 
        email: normalizedEmail, 
        full_name,
        role
      },
      token
      });

  } catch (err) {
    console.error('Registration Error:', err);

    if (err.code === 'ER_DUP_ENTRY' || err.errno === 1062) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { signup, login, getProfile, updateProfile, deleteUser, forgotPassword, resetPassword, createUser };
