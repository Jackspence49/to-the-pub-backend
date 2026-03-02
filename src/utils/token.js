const jwt = require('jsonwebtoken');

function buildToken({ id, email }) {
  const payload = {
    userId: id,
    email,
    userType: 'app_user'
  };
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
}

module.exports = { buildToken };
