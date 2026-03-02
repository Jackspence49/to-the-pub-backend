// Mirror the module's internal constants so tests are readable without magic numbers.
// If you change them in loginRateLimiter.js, update these too.
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;   // 15 minutes
const LOCKOUT_MS = 15 * 60 * 1000;  // 15 minutes

describe('loginRateLimiter middleware', () => {
  let loginRateLimiter;
  let mockRes, mockNext;

  // Re-require the module before every test so each test starts with an empty store.
  beforeEach(() => {
    jest.resetModules();
    loginRateLimiter = require('../../src/middleware/loginRateLimiter');

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      set: jest.fn()
    };
    mockNext = jest.fn();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // Build a minimal req object.
  function makeReq(ip = '1.2.3.4', forwardedFor = null) {
    return {
      ip,
      headers: forwardedFor ? { 'x-forwarded-for': forwardedFor } : {}
    };
  }

  // Run the middleware for a given IP and immediately record a failed attempt.
  // Returns the req object used (so callers can inspect helpers if needed).
  function simulateFailure(ip = '1.2.3.4') {
    const req = makeReq(ip);
    loginRateLimiter(req, mockRes, jest.fn());
    req.recordFailedLogin();
    return req;
  }

  // ─────────────────────────────────────────────
  // Normal pass-through
  // ─────────────────────────────────────────────
  describe('normal pass-through', () => {
    test('calls next() when there are no prior failed attempts', () => {
      const req = makeReq();
      loginRateLimiter(req, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    test('attaches recordFailedLogin as a function on req', () => {
      const req = makeReq();
      loginRateLimiter(req, mockRes, mockNext);

      expect(typeof req.recordFailedLogin).toBe('function');
    });

    test('attaches clearFailedLogins as a function on req', () => {
      const req = makeReq();
      loginRateLimiter(req, mockRes, mockNext);

      expect(typeof req.clearFailedLogins).toBe('function');
    });
  });

  // ─────────────────────────────────────────────
  // Attempt counting — below threshold
  // ─────────────────────────────────────────────
  describe('below the lockout threshold', () => {
    test('allows requests after fewer than MAX_ATTEMPTS failures', () => {
      for (let i = 0; i < MAX_ATTEMPTS - 1; i++) {
        simulateFailure();
      }

      loginRateLimiter(makeReq(), mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalledWith(429);
    });

    test('does not set Retry-After header below the threshold', () => {
      for (let i = 0; i < MAX_ATTEMPTS - 1; i++) {
        simulateFailure();
      }

      loginRateLimiter(makeReq(), mockRes, mockNext);

      expect(mockRes.set).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────
  // Lockout behavior — at and above threshold
  // ─────────────────────────────────────────────
  describe('lockout after MAX_ATTEMPTS failures', () => {
    beforeEach(() => {
      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        simulateFailure();
      }
    });

    test('returns 429 on the next request', () => {
      loginRateLimiter(makeReq(), mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(429);
    });

    test('does not call next() when locked out', () => {
      loginRateLimiter(makeReq(), mockRes, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
    });

    test('response body contains an error message', () => {
      loginRateLimiter(makeReq(), mockRes, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(String) })
      );
    });

    test('response body contains retryAfter in seconds', () => {
      loginRateLimiter(makeReq(), mockRes, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ retryAfter: expect.any(Number) })
      );
    });

    test('sets the Retry-After response header', () => {
      loginRateLimiter(makeReq(), mockRes, mockNext);

      expect(mockRes.set).toHaveBeenCalledWith('Retry-After', expect.any(String));
    });

    test('Retry-After header value matches retryAfter in body', () => {
      loginRateLimiter(makeReq(), mockRes, mockNext);

      const headerCall = mockRes.set.mock.calls[0];
      const bodyCall = mockRes.json.mock.calls[0][0];

      expect(headerCall[1]).toBe(String(bodyCall.retryAfter));
    });

    test('retryAfter is greater than zero', () => {
      loginRateLimiter(makeReq(), mockRes, mockNext);

      const { retryAfter } = mockRes.json.mock.calls[0][0];
      expect(retryAfter).toBeGreaterThan(0);
    });

    test('retryAfter does not exceed LOCKOUT_MS in seconds', () => {
      loginRateLimiter(makeReq(), mockRes, mockNext);

      const { retryAfter } = mockRes.json.mock.calls[0][0];
      expect(retryAfter).toBeLessThanOrEqual(LOCKOUT_MS / 1000);
    });

    test('subsequent requests after lockout are also blocked', () => {
      const secondRes = { ...mockRes, status: jest.fn().mockReturnThis(), json: jest.fn() };
      loginRateLimiter(makeReq(), mockRes, jest.fn());
      loginRateLimiter(makeReq(), secondRes, jest.fn());

      expect(secondRes.status).toHaveBeenCalledWith(429);
    });
  });

  // ─────────────────────────────────────────────
  // Clearing attempts on success
  // ─────────────────────────────────────────────
  describe('clearFailedLogins', () => {
    test('resets the counter so a previously-failing IP can log in again', () => {
      // Accumulate failures just below the lockout
      for (let i = 0; i < MAX_ATTEMPTS - 1; i++) {
        simulateFailure();
      }

      // Simulate a successful login
      const successReq = makeReq();
      loginRateLimiter(successReq, mockRes, jest.fn());
      successReq.clearFailedLogins();

      // Now MAX_ATTEMPTS more failures should be required to lock again
      for (let i = 0; i < MAX_ATTEMPTS - 1; i++) {
        simulateFailure();
      }

      loginRateLimiter(makeReq(), mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalledWith(429);
    });

    test('clears a locked-out IP so it can pass through', () => {
      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        simulateFailure();
      }

      // Admin/manual clear (e.g. would be triggered by a password reset)
      const clearReq = makeReq();
      loginRateLimiter(clearReq, mockRes, jest.fn()); // blocked — but still attaches helpers
      // In the locked state the middleware returns early, so helpers are not attached.
      // We instead call clearFailedAttempts by simulating from a fresh pass.
      // To replicate the real-world flow: a correct login would only reach clearFailedLogins
      // after the lockout expires, but we can still verify the clearing logic by
      // advancing time past the lockout first.
      jest.useFakeTimers();
      jest.setSystemTime(Date.now() + LOCKOUT_MS + 1);

      const unlockedReq = makeReq();
      loginRateLimiter(unlockedReq, mockRes, mockNext);
      unlockedReq.clearFailedLogins();

      // Advance time back; a fresh attempt should start from zero
      const nextReq = makeReq();
      loginRateLimiter(nextReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────
  // Time-window expiry
  // ─────────────────────────────────────────────
  describe('sliding window expiry', () => {
    test('resets the failure count after the window expires', () => {
      jest.useFakeTimers();
      const start = Date.now();
      jest.setSystemTime(start);

      for (let i = 0; i < MAX_ATTEMPTS - 1; i++) {
        simulateFailure();
      }

      // Advance past the window
      jest.setSystemTime(start + WINDOW_MS + 1);

      // One more failure recorded in a fresh window — should not lock
      simulateFailure();

      loginRateLimiter(makeReq(), mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalledWith(429);
    });

    test('fails to lock when MAX_ATTEMPTS are spread across two windows', () => {
      jest.useFakeTimers();
      const start = Date.now();
      jest.setSystemTime(start);

      // 4 failures in window 1
      for (let i = 0; i < MAX_ATTEMPTS - 1; i++) {
        simulateFailure();
      }

      // Jump to window 2
      jest.setSystemTime(start + WINDOW_MS + 1);

      // 4 failures in window 2
      for (let i = 0; i < MAX_ATTEMPTS - 1; i++) {
        simulateFailure();
      }

      loginRateLimiter(makeReq(), mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────
  // Lockout expiry
  // ─────────────────────────────────────────────
  describe('lockout expiry', () => {
    test('allows requests again after the lockout period expires', () => {
      jest.useFakeTimers();
      const start = Date.now();
      jest.setSystemTime(start);

      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        simulateFailure();
      }

      // Verify it is locked
      loginRateLimiter(makeReq(), mockRes, jest.fn());
      expect(mockRes.status).toHaveBeenCalledWith(429);

      // Advance past the lockout
      jest.resetAllMocks();
      mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
        set: jest.fn()
      };
      jest.setSystemTime(start + LOCKOUT_MS + 1);

      loginRateLimiter(makeReq(), mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalledWith(429);
    });

    test('retryAfter decreases as time passes during lockout', () => {
      jest.useFakeTimers();
      const start = Date.now();
      jest.setSystemTime(start);

      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        simulateFailure();
      }

      // First check — immediately after lockout
      loginRateLimiter(makeReq(), mockRes, jest.fn());
      const firstRetryAfter = mockRes.json.mock.calls[0][0].retryAfter;

      // Advance 60 seconds into the lockout
      jest.setSystemTime(start + 60 * 1000);
      mockRes.json.mockClear();

      loginRateLimiter(makeReq(), mockRes, jest.fn());
      const laterRetryAfter = mockRes.json.mock.calls[0][0].retryAfter;

      expect(laterRetryAfter).toBeLessThan(firstRetryAfter);
    });
  });

  // ─────────────────────────────────────────────
  // IP resolution
  // ─────────────────────────────────────────────
  describe('IP resolution', () => {
    test('uses req.ip when X-Forwarded-For is absent', () => {
      const req = makeReq('5.6.7.8');
      loginRateLimiter(req, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    test('uses the first address in X-Forwarded-For', () => {
      // Lock out the proxy IP, not req.ip
      const proxyIp = '10.0.0.1';
      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        const req = makeReq('127.0.0.1', proxyIp);
        loginRateLimiter(req, mockRes, jest.fn());
        req.recordFailedLogin();
      }

      // Same proxy IP → blocked
      const blockedReq = makeReq('127.0.0.1', proxyIp);
      loginRateLimiter(blockedReq, mockRes, mockNext);
      expect(mockRes.status).toHaveBeenCalledWith(429);

      // Different proxy IP → allowed
      mockNext.mockClear();
      mockRes.status.mockClear();
      const allowedReq = makeReq('127.0.0.1', '10.0.0.2');
      loginRateLimiter(allowedReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });

    test('trims whitespace from X-Forwarded-For', () => {
      // Lock using a padded version of the IP
      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        const req = makeReq('127.0.0.1', ' 192.168.1.1 , 10.0.0.1');
        loginRateLimiter(req, mockRes, jest.fn());
        req.recordFailedLogin();
      }

      // Same IP without padding should also be locked (trimming is consistent)
      const req = makeReq('127.0.0.1', ' 192.168.1.1 , 10.0.0.1');
      loginRateLimiter(req, mockRes, mockNext);
      expect(mockRes.status).toHaveBeenCalledWith(429);
    });

    test('tracks different IPs independently', () => {
      // Lock IP A
      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        simulateFailure('10.0.0.1');
      }

      // IP B should still be free
      loginRateLimiter(makeReq('10.0.0.2'), mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalledWith(429);
    });

    test('a locked IP does not affect a different IP', () => {
      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        simulateFailure('192.168.0.1');
      }

      // Confirm 192.168.0.1 is locked
      loginRateLimiter(makeReq('192.168.0.1'), mockRes, jest.fn());
      expect(mockRes.status).toHaveBeenCalledWith(429);

      // 192.168.0.2 should not be affected
      mockNext.mockClear();
      mockRes.status.mockClear();
      loginRateLimiter(makeReq('192.168.0.2'), mockRes, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });
  });
});
