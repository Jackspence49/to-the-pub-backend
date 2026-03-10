const crypto = require('crypto');
const db = require('../utils/db');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const { MIN_PASSWORD_LENGTH, SALT_ROUNDS } = require('../utils/constants');
const { normalizeEmail, isValidEmail, isValidPassword, formatPhoneForDB, isValidPhone, isValidRole } = require('../utils/user');

//Missing but in Users
const { ensureWebUserToken } = require('../middleware/token');
const { buildWebUserToken } = require('../utils/token');
const { sendPasswordResetEmail } = require('../utils/email');
const jwt = require('jsonwebtoken');

const { MIN_PASSWORD_LENGTH, SALT_ROUNDS } = require('../utils/constants');
const { normalizeEmail, isValidEmail, isValidPassword, formatPhoneForDB, isValidPhone } = require('../utils/user');



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
      req.recordFailedLogin?.();
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = rows[0];

    // Compare the received password with the stored hashed password using bcrypt.compare()
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      req.recordFailedLogin?.();
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    req.clearFailedLogins?.();

    // Create JWT token with user ID and role information
    const jwtPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      userType: 'web_user'
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

//Get current user profile (protected route)
async function getProfile(req, res) {
  if (!ensureWebUserToken(req, res)) {
  return; 
  }

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

//Update user profile (protected route)
async function updateProfile(req, res) {
  if (!ensureWebUserToken(req, res)) {
  return; 
  }

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

// Delete user by UUID (protected route)
async function deleteUser(req, res) {
  try {
    const { id } = req.params; // UUID from URL parameters
    
    if (!id) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    // Basic UUID format validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return res.status(400).json({ error: 'Invalid UUID format' });
    }

    // Check if user exists before deletion
    const selectSql = `SELECT id, email FROM web_users WHERE id = ? LIMIT 1`;
    const [rows] = await db.execute(selectSql, [id]);
    
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userToDelete = rows[0];
    
    // Delete the user
    const deleteSql = `DELETE FROM web_users WHERE id = ?`;
    const [result] = await db.execute(deleteSql, [id]);
    
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
