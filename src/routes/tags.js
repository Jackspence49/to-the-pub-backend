const express = require('express');
const router = express.Router();
const tagsController = require('../controllers/tags');
const { authenticateToken } = require('../utils/auth');

// Public routes (read operations)
// GET /tags -> list all tags
router.get('/', tagsController.getAllTags);

// Protected routes (data modification)
// POST /tags -> create a new tag
router.post('/', authenticateToken, tagsController.createTag);
// PUT /tags/:id -> update tag information
router.put('/:id', authenticateToken, tagsController.updateTag);
// DELETE /tags/:id -> delete tag (only if not used by any bars)
router.delete('/:id', authenticateToken, tagsController.deleteTag);

module.exports = router;
