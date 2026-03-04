const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;   // 15-minute sliding window
const LOCKOUT_MS = 15 * 60 * 1000;  // 15-minute lockout after exceeding limit

// Map<ip, { count, firstAttempt, lockedUntil }>
const store = new Map();

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  return forwarded ? forwarded.split(',')[0].trim() : req.ip;
}

function recordFailedAttempt(ip) {
  const now = Date.now();
  const record = store.get(ip) || { count: 0, firstAttempt: now };

  // Reset window if it has expired
  if (now - record.firstAttempt > WINDOW_MS) {
    record.count = 0;
    record.firstAttempt = now;
    delete record.lockedUntil;
  }

  record.count++;

  if (record.count >= MAX_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_MS;
  }

  store.set(ip, record);
}

function clearFailedAttempts(ip) {
  store.delete(ip);
}

function loginRateLimiter(req, res, next) {
  const ip = getClientIp(req);
  const now = Date.now();
  const record = store.get(ip);

  if (record?.lockedUntil && now < record.lockedUntil) {
    const retryAfterSeconds = Math.ceil((record.lockedUntil - now) / 1000);
    res.set('Retry-After', String(retryAfterSeconds));
    return res.status(429).json({
      error: 'Too many failed login attempts. Please try again later.',
      retryAfter: retryAfterSeconds
    });
  }

  req.recordFailedLogin = () => recordFailedAttempt(ip);
  req.clearFailedLogins = () => clearFailedAttempts(ip);

  next();
}

module.exports = loginRateLimiter;
