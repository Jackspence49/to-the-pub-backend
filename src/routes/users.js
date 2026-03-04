const express = require('express');
const router = express.Router();
const usersController = require('../controllers/users');
const userBarsController = require('../controllers/userBars');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const loginRateLimiter = require('../middleware/loginRateLimiter');

// Public routes (no authentication required)
// POST /users/login -> login with email + password
router.post('/login', loginRateLimiter, usersController.login);
// POST /users/forgot-password -> initiate password reset
router.post('/forgot-password', usersController.forgotPassword);
// POST /users/reset-password -> reset password with token
router.post('/reset-password', usersController.resetPassword);

// Protected routes (authentication required)
// POST /users -> signup (creates a admin user for this form)
router.post('/', authenticateToken, usersController.signup);
// POST /users/invite -> create a non-admin web user (admin only)
router.post('/invite', authenticateToken, requireAdmin, usersController.inviteUser);
// GET /users/profile -> get current user profile
router.get('/profile', authenticateToken, usersController.getProfile);
// PUT /users/profile -> update current user profile
router.put('/profile', authenticateToken, usersController.updateProfile);
// DELETE /users/:id -> delete user by UUID
router.delete('/:id', authenticateToken, usersController.deleteUser);

// Bar association routes
// POST /users/:userId/bars/:barId -> assign a bar to a user (admin only)
router.post('/:userId/bars/:barId', authenticateToken, requireAdmin, userBarsController.assignUserToBar);
// DELETE /users/:userId/bars/:barId -> unassign a bar from a user (admin only)
router.delete('/:userId/bars/:barId', authenticateToken, requireAdmin, userBarsController.unassignUserFromBar);
// GET /users/:userId/bars -> get bars assigned to a user (admin or own user)
router.get('/:userId/bars', authenticateToken, userBarsController.getUserBars);

module.exports = router;
