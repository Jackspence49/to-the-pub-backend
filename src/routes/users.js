const express = require('express');
const router = express.Router();
const usersController = require('../controllers/users');
const { authenticateToken } = require('../utils/auth');

// Public routes (no authentication required)
// POST /users/login -> login with email + password
router.post('/login', usersController.login);
// POST /users/forgot-password -> initiate password reset
router.post('/forgot-password', usersController.forgotPassword);
// POST /users/reset-password -> reset password with token
router.post('/reset-password', usersController.resetPassword);

// Protected routes (authentication required)
// POST /users -> signup (creates a super_admin user for this form)
router.post('/', authenticateToken, usersController.signup);
// GET /users/profile -> get current user profile
router.get('/profile', authenticateToken, usersController.getProfile);
// PUT /users/profile -> update current user profile
router.put('/profile', authenticateToken, usersController.updateProfile);
// DELETE /users/:id -> delete user by UUID
router.delete('/:id', authenticateToken, usersController.deleteUser);

module.exports = router;
