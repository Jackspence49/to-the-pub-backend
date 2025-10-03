const express = require('express');
const router = express.Router();
const tagsController = require('../controllers/tags');

// GET /tags -> list all tags
router.get('/', tagsController.getAllTags);

module.exports = router;
