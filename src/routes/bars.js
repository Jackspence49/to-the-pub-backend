const express = require('express');
const router = express.Router();
const barsController = require('../controllers/bars');
const { authenticateToken, optionalAuth } = require('../utils/auth');

// Public routes (read operations)
// GET /bars -> list all bars (optional auth for future features)
router.get('/', optionalAuth, barsController.getAllBars);
// GET /bars/:id -> get single bar (optional auth for future features)
router.get('/:id', optionalAuth, barsController.getBar);

// Protected routes (data modification)
// POST /bars -> create a new bar with hours and tags
router.post('/', authenticateToken, barsController.createBar);
// PUT /bars/:id -> update bar information
router.put('/:id', authenticateToken, barsController.updateBar);
// DELETE /bars/:id -> soft delete bar (set is_active to false)
router.delete('/:id', authenticateToken, barsController.deleteBar);

module.exports = router;
