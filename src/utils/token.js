const jwt = require('jsonwebtoken');

// 
function buildAppUserToken({ id, email }) {
  const payload = {
    userId: id,
    email,
    userType: 'app_user'
  };
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
}

 function buildWebUserToken({ id, email, role }) {
    const payload = {
      userId: id,
      email,
      role,
      userType: 'web_user'
    };
    return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
  }

module.exports = { buildAppUserToken, buildWebUserToken };
