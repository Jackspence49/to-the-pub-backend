const express = require('express');
const router = express.Router();
const usersController = require('../controllers/users');

// POST /users -> signup (creates a super_admin user for this form)
router.post('/', usersController.signup);

module.exports = router;
