const express = require('express');
const router = express.Router();
const eventTagsController = require('../controllers/event-tags');
const eventsController = require('../controllers/events');
const { authenticateToken } = require('../utils/auth');

// Public routes (read operations)
// GET /event-tags -> list all event tags
router.get('/', eventTagsController.getAllEventTags);

// GET /event-tags/:tagId/events -> get all events with a specific tag
router.get('/:tagId/events', eventsController.getEventsByTag);

// Protected routes (data modification)
// POST /event-tags -> create a new event tag
router.post('/', authenticateToken, eventTagsController.createEventTag);
// PUT /event-tags/:id -> update event tag information
router.put('/:id', authenticateToken, eventTagsController.updateEventTag);
// DELETE /event-tags/:id -> delete event tag (only if not used by any events)
router.delete('/:id', authenticateToken, eventTagsController.deleteEventTag);

module.exports = router;