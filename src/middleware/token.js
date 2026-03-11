// Middleware to ensure the request has a valid user token

const ensureAppUserToken = (req, res) => {
  if (!req.user || req.user.userType !== 'app_user') {
    res.status(403).json({ error: 'App user authentication required' });
    return false;
  }
  return true;
};

const ensureWebUserToken = (req, res) => {
  if (!req.user || req.user.userType !== 'web_user') {
    res.status(403).json({ error: 'Web user authentication required' });
    return false;
  }
  return true;
};

module.exports = { ensureAppUserToken, ensureWebUserToken };

