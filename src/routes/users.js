const express = require('express');
const router = express.Router();
const usersController = require('../controllers/users');
const { authenticateToken } = require('../utils/auth');

// Public routes (no authentication required)
// POST /users/login -> login with email + password
router.post('/login', usersController.login);

// Protected routes (authentication required)
// POST /users -> signup (creates a super_admin user for this form)
router.post('/', authenticateToken, usersController.signup);
// GET /users/profile -> get current user profile
router.get('/profile', authenticateToken, usersController.getProfile);
// PUT /users/profile -> update current user profile
router.put('/profile', authenticateToken, usersController.updateProfile);

module.exports = router;
