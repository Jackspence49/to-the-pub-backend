const express = require('express');
const router = express.Router();
const appUsersController = require('../controllers/appUsers');
const { authenticateToken } = require('../utils/auth');
const loginRateLimiter = require('../middleware/loginRateLimiter');

// Public routes
router.post('/register', appUsersController.register);
router.post('/login', loginRateLimiter, appUsersController.login);
router.post('/forgot-password', appUsersController.forgotPassword);
router.post('/reset-password', appUsersController.resetPassword);

// Protected routes
router.get('/me', authenticateToken, appUsersController.getProfile);
router.put('/me', authenticateToken, appUsersController.updateProfile);

module.exports = router;
