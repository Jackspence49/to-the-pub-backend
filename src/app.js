const express = require('express');
const cors = require('cors');
const app = express();

// load environment variables (DB config, etc.)
require('../config/env');

// Routes
const tagsRouter = require('./routes/tags');
const barsRouter = require('./routes/bars');
const usersRouter = require('./routes/users');

// enable CORS for the frontend. Prefer configuring the real frontend origin
// via the FRONTEND_URL environment variable. Falls back to localhost for dev.
const REACT_APP_API_URL = process.env.REACT_APP_API_URL;
app.use(cors({
  origin: REACT_APP_API_URL,
}));

app.use(express.json());

// mount tags routes at /tags
app.use('/tags', tagsRouter);
// mount bars routes at /bars
app.use('/bars', barsRouter);
// mount users routes at /users
app.use('/users', usersRouter);

module.exports = app;