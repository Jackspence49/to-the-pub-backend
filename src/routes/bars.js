const express = require('express');
const router = express.Router();
const barsController = require('../controllers/bars');

// POST /bars -> create a new bar with hours and tags
router.post('/', barsController.createBar);

module.exports = router;
