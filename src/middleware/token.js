// Middleware to ensure the request has a valid app user token

const ensureAppUserToken = (req, res) => {
  if (!req.user || req.user.userType !== 'app_user') {
    res.status(403).json({ error: 'App user authentication required' });
    return false;
  }
  return true;
};

exports = ensureAppUserToken;

