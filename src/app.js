const express = require('express');
const cors = require('cors');
const app = express();

// load environment variables (DB config, etc.)
require('../config/env');

// Routes
const tagsRouter = require('./routes/tags');
const eventTagsRouter = require('./routes/event-tags');
const barsRouter = require('./routes/bars');
const usersRouter = require('./routes/users');
const eventsRouter = require('./routes/events');
const appUsersRouter = require('./routes/app-users');

// enable CORS for the frontend. Prefer configuring the real frontend origin
// via the FRONTEND_URL environment variable. Falls back to localhost for dev.
const REACT_APP_API_URL = process.env.REACT_APP_API_URL;
app.use(cors({
  origin: REACT_APP_API_URL,
}));

app.use(express.json());

// mount tags routes at /tags
app.use('/tags', tagsRouter);
// mount event tags routes at /event-tags
app.use('/event-tags', eventTagsRouter);
// mount bars routes at /bars
app.use('/bars', barsRouter);
// mount users routes at /users
app.use('/users', usersRouter);
// mount app user routes at /app-users
app.use('/app-users', appUsersRouter);
// mount events routes at /events
app.use('/events', eventsRouter);

// JSON parsing error handler
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      error: 'Invalid JSON format in request body. Please check your JSON syntax.',
      details: 'Make sure all string values are enclosed in double quotes and the JSON is properly formatted.'
    });
  }
  next(err);
});

module.exports = app;