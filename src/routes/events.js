const express = require('express');
const router = express.Router();
const eventsController = require('../controllers/events');
const { authenticateToken } = require('../utils/auth');

// Public routes (no authentication required)

/**
 * GET /events
 * Get all events with optional filtering
 * Query params: bar_id, category, date_from, date_to, upcoming, page, limit
 */
router.get('/', eventsController.getAllEvents);

/**
 * GET /events/:id
 * Get a single event by ID
 */
router.get('/:id', eventsController.getEvent);

// Protected routes (authentication required)

/**
 * POST /events
 * Create a new event
 * Requires JWT authentication
 */
router.post('/', authenticateToken, eventsController.createEvent);

/**
 * PUT /events/:id
 * Update an existing event
 * Requires JWT authentication
 */
router.put('/:id', authenticateToken, eventsController.updateEvent);

/**
 * DELETE /events/:id
 * Soft delete an event (sets is_active = false)
 * Requires JWT authentication
 */
router.delete('/:id', authenticateToken, eventsController.deleteEvent);

module.exports = router;