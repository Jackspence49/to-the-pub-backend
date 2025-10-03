const express = require('express');
const cors = require('cors');
const app = express();

// load environment variables (DB config, etc.)
require('../config/env');

// Routes
const tagsRouter = require('./routes/tags');
const barsRouter = require('./routes/bars');

// enable CORS for the frontend during development
app.use(cors({
	origin: 'http://localhost:3000', // your frontend origin
}));

app.use(express.json());

// mount tags routes at /tags
app.use('/tags', tagsRouter);
// mount bars routes at /bars
app.use('/bars', barsRouter);

module.exports = app;