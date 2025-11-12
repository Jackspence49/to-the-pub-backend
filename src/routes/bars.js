const express = require('express');
const router = express.Router();
const barsController = require('../controllers/bars');
const eventsController = require('../controllers/events');
const { authenticateToken, optionalAuth } = require('../utils/auth');

// Public routes (read operations)
// GET /bars -> list all bars with optional filtering and includes (optional auth for future features)
router.get('/', optionalAuth, barsController.getAllBars);
// GET /bars/search/name -> search bars by name with optional includes
router.get('/search/name', optionalAuth, barsController.searchBarsByName);
// GET /bars/:barId/tags -> get all tags associated with a specific bar
router.get('/:barId/tags', barsController.getBarTags);
// GET /bars/:barId/hours -> get all hours for a specific bar
router.get('/:barId/hours', barsController.getBarHours);
// GET /bars/:barId/events -> get all events for a specific bar
router.get('/:barId/events', eventsController.getBarEvents);
// GET /bars/:id -> get single bar with optional includes (optional auth for future features)
router.get('/:id', optionalAuth, barsController.getBar);

// Protected routes (data modification)
// POST /bars -> create a new bar with hours and tags
router.post('/', authenticateToken, barsController.createBar);
// PUT /bars/:id -> update bar information
router.put('/:id', authenticateToken, barsController.updateBar);
// PUT /bars/:barId/hours -> update bar hours
router.put('/:barId/hours', authenticateToken, barsController.updateBarHours);
// DELETE /bars/:id -> soft delete bar (set is_active to false)
router.delete('/:id', authenticateToken, barsController.deleteBar);
// POST /bars/:barId/tags/:tagId -> add a tag to a bar
router.post('/:barId/tags/:tagId', authenticateToken, barsController.addTagToBar);
// DELETE /bars/:barId/tags/:tagId -> remove a tag from a bar
router.delete('/:barId/tags/:tagId', authenticateToken, barsController.removeTagFromBar);

module.exports = router;
