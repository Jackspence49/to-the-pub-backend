const express = require('express');
const router = express.Router();
const eventsController = require('../controllers/events');
const eventTagsController = require('../controllers/event-tags');
const { authenticateToken } = require('../utils/auth');

// Public routes (no authentication required)

/**
 * GET /events
 * Get all events with optional filtering
 * Query params: bar_id, category, date_from, date_to, upcoming, tag_ids, page, limit
 */
router.get('/', eventsController.getAllEvents);

/**
 * GET /events/:id
 * Get a single event by ID (includes tags)
 */
router.get('/:id', eventsController.getEvent);

/**
 * GET /events/:eventId/tags
 * Get all tags assigned to a specific event
 */
router.get('/:eventId/tags', eventTagsController.getEventTags);

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

/**
 * POST /events/:eventId/tags
 * Assign tags to an event
 * Requires JWT authentication
 */
router.post('/:eventId/tags', authenticateToken, eventTagsController.assignTagsToEvent);

/**
 * DELETE /events/:eventId/tags/:tagId
 * Remove a specific tag from an event
 * Requires JWT authentication
 */
router.delete('/:eventId/tags/:tagId', authenticateToken, eventTagsController.removeTagFromEvent);

module.exports = router;