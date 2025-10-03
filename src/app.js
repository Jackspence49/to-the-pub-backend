const express = require('express');
const app = express();

// load environment variables (DB config, etc.)
require('../config/env');

// Routes
const tagsRouter = require('./routes/tags');

app.use(express.json());

// mount tags routes at /tags
app.use('/tags', tagsRouter);

module.exports = app;