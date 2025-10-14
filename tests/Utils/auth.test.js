const jwt = require('jsonwebtoken');
const { authenticateToken, optionalAuth } = require('../../src/utils/auth');

// Mock jsonwebtoken
jest.mock('jsonwebtoken');

// Mock environment variables
const originalEnv = process.env;
beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    process.env.JWT_SECRET = 'test-secret-key';
    jest.clearAllMocks();
});

afterEach(() => {
    process.env = originalEnv;
});

describe('Authentication Middleware Tests', () => {
    let mockReq, mockRes, mockNext;

    beforeEach(() => {
        mockReq = {
            headers: {}
        };
        mockRes = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis()
        };
        mockNext = jest.fn();
    });

    describe('authenticateToken middleware', () => {
        describe('Missing Authorization Header', () => {
            test('should return 401 when no authorization header is provided', () => {
                authenticateToken(mockReq, mockRes, mockNext);

                expect(mockRes.status).toHaveBeenCalledWith(401);
                expect(mockRes.json).toHaveBeenCalledWith({
                    success: false,
                    message: 'Access denied. No token provided or invalid format. Expected: Bearer <token>'
                });
                expect(mockNext).not.toHaveBeenCalled();
            });

            test('should return 401 when authorization header is empty string', () => {
                mockReq.headers.authorization = '';

                authenticateToken(mockReq, mockRes, mockNext);

                expect(mockRes.status).toHaveBeenCalledWith(401);
                expect(mockRes.json).toHaveBeenCalledWith({
                    success: false,
                    message: 'Access denied. No token provided or invalid format. Expected: Bearer <token>'
                });
                expect(mockNext).not.toHaveBeenCalled();
            });

            test('should return 401 when authorization header is null', () => {
                mockReq.headers.authorization = null;

                authenticateToken(mockReq, mockRes, mockNext);

                expect(mockRes.status).toHaveBeenCalledWith(401);
                expect(mockRes.json).toHaveBeenCalledWith({
                    success: false,
                    message: 'Access denied. No token provided or invalid format. Expected: Bearer <token>'
                });
                expect(mockNext).not.toHaveBeenCalled();
            });
        });

        describe('Invalid Authorization Header Format', () => {
            test('should return 401 when authorization header does not start with "Bearer "', () => {
                mockReq.headers.authorization = 'Basic some-token';

                authenticateToken(mockReq, mockRes, mockNext);

                expect(mockRes.status).toHaveBeenCalledWith(401);
                expect(mockRes.json).toHaveBeenCalledWith({
                    success: false,
                    message: 'Access denied. No token provided or invalid format. Expected: Bearer <token>'
                });
                expect(mockNext).not.toHaveBeenCalled();
            });

            test('should return 401 when authorization header is just "Bearer"', () => {
                mockReq.headers.authorization = 'Bearer';

                authenticateToken(mockReq, mockRes, mockNext);

                expect(mockRes.status).toHaveBeenCalledWith(401);
                expect(mockRes.json).toHaveBeenCalledWith({
                    success: false,
                    message: 'Access denied. No token provided or invalid format. Expected: Bearer <token>'
                });
                expect(mockNext).not.toHaveBeenCalled();
            });

            test('should return 401 when authorization header is "Bearer " with only space', () => {
                mockReq.headers.authorization = 'Bearer ';

                authenticateToken(mockReq, mockRes, mockNext);

                expect(mockRes.status).toHaveBeenCalledWith(401);
                expect(mockRes.json).toHaveBeenCalledWith({
                    success: false,
                    message: 'Access denied. No token provided.'
                });
                expect(mockNext).not.toHaveBeenCalled();
            });

            test('should return 401 when authorization header has wrong case', () => {
                mockReq.headers.authorization = 'bearer valid-token';

                authenticateToken(mockReq, mockRes, mockNext);

                expect(mockRes.status).toHaveBeenCalledWith(401);
                expect(mockRes.json).toHaveBeenCalledWith({
                    success: false,
                    message: 'Access denied. No token provided or invalid format. Expected: Bearer <token>'
                });
                expect(mockNext).not.toHaveBeenCalled();
            });
        });

        describe('Valid Token Scenarios', () => {
            test('should successfully authenticate with valid token', () => {
                const mockDecodedToken = {
                    userId: 'user-123',
                    email: 'test@example.com',
                    role: 'user'
                };
                
                mockReq.headers.authorization = 'Bearer valid-jwt-token';
                jwt.verify.mockReturnValue(mockDecodedToken);

                authenticateToken(mockReq, mockRes, mockNext);

                expect(jwt.verify).toHaveBeenCalledWith('valid-jwt-token', 'test-secret-key');
                expect(mockReq.user).toEqual(mockDecodedToken);
                expect(mockNext).toHaveBeenCalled();
                expect(mockRes.status).not.toHaveBeenCalled();
                expect(mockRes.json).not.toHaveBeenCalled();
            });

            test('should handle token with extra whitespace', () => {
                const mockDecodedToken = {
                    userId: 'user-123',
                    email: 'test@example.com',
                    role: 'user'
                };
                
                mockReq.headers.authorization = 'Bearer   valid-jwt-token-with-spaces   ';
                jwt.verify.mockReturnValue(mockDecodedToken);

                authenticateToken(mockReq, mockRes, mockNext);

                expect(jwt.verify).toHaveBeenCalledWith('  valid-jwt-token-with-spaces   ', 'test-secret-key');
                expect(mockReq.user).toEqual(mockDecodedToken);
                expect(mockNext).toHaveBeenCalled();
            });

            test('should authenticate with long JWT token', () => {
                const mockDecodedToken = {
                    userId: 'user-123',
                    email: 'test@example.com',
                    role: 'super_admin',
                    iat: 1697234567,
                    exp: 1697320967
                };
                
                const longToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
                
                mockReq.headers.authorization = `Bearer ${longToken}`;
                jwt.verify.mockReturnValue(mockDecodedToken);

                authenticateToken(mockReq, mockRes, mockNext);

                expect(jwt.verify).toHaveBeenCalledWith(longToken, 'test-secret-key');
                expect(mockReq.user).toEqual(mockDecodedToken);
                expect(mockNext).toHaveBeenCalled();
            });
        });

        describe('JWT Error Handling', () => {
            test('should return 403 for expired token (TokenExpiredError)', () => {
                mockReq.headers.authorization = 'Bearer expired-token';
                
                const expiredError = new Error('jwt expired');
                expiredError.name = 'TokenExpiredError';
                jwt.verify.mockImplementation(() => {
                    throw expiredError;
                });

                authenticateToken(mockReq, mockRes, mockNext);

                expect(mockRes.status).toHaveBeenCalledWith(403);
                expect(mockRes.json).toHaveBeenCalledWith({
                    success: false,
                    message: 'Token has expired. Please login again.'
                });
                expect(mockNext).not.toHaveBeenCalled();
            });

            test('should return 403 for invalid token signature (JsonWebTokenError)', () => {
                mockReq.headers.authorization = 'Bearer invalid-signature-token';
                
                const invalidError = new Error('invalid signature');
                invalidError.name = 'JsonWebTokenError';
                jwt.verify.mockImplementation(() => {
                    throw invalidError;
                });

                authenticateToken(mockReq, mockRes, mockNext);

                expect(mockRes.status).toHaveBeenCalledWith(403);
                expect(mockRes.json).toHaveBeenCalledWith({
                    success: false,
                    message: 'Invalid token. Access forbidden.'
                });
                expect(mockNext).not.toHaveBeenCalled();
            });

            test('should return 403 for not-before token (NotBeforeError)', () => {
                mockReq.headers.authorization = 'Bearer not-before-token';
                
                const notBeforeError = new Error('jwt not active');
                notBeforeError.name = 'NotBeforeError';
                jwt.verify.mockImplementation(() => {
                    throw notBeforeError;
                });

                authenticateToken(mockReq, mockRes, mockNext);

                expect(mockRes.status).toHaveBeenCalledWith(403);
                expect(mockRes.json).toHaveBeenCalledWith({
                    success: false,
                    message: 'Token is not active yet.'
                });
                expect(mockNext).not.toHaveBeenCalled();
            });

            test('should return 403 for unknown JWT error', () => {
                mockReq.headers.authorization = 'Bearer malformed-token';
                
                const unknownError = new Error('unknown jwt error');
                unknownError.name = 'UnknownJWTError';
                jwt.verify.mockImplementation(() => {
                    throw unknownError;
                });

                authenticateToken(mockReq, mockRes, mockNext);

                expect(mockRes.status).toHaveBeenCalledWith(403);
                expect(mockRes.json).toHaveBeenCalledWith({
                    success: false,
                    message: 'Token validation failed. Access forbidden.'
                });
                expect(mockNext).not.toHaveBeenCalled();
            });

            test('should handle malformed JWT token', () => {
                mockReq.headers.authorization = 'Bearer malformed.jwt.token';
                
                const malformedError = new Error('jwt malformed');
                malformedError.name = 'JsonWebTokenError';
                jwt.verify.mockImplementation(() => {
                    throw malformedError;
                });

                authenticateToken(mockReq, mockRes, mockNext);

                expect(mockRes.status).toHaveBeenCalledWith(403);
                expect(mockRes.json).toHaveBeenCalledWith({
                    success: false,
                    message: 'Invalid token. Access forbidden.'
                });
                expect(mockNext).not.toHaveBeenCalled();
            });
        });

        describe('Environment Configuration', () => {
            test('should use JWT_SECRET from environment', () => {
                process.env.JWT_SECRET = 'custom-secret-key';
                mockReq.headers.authorization = 'Bearer test-token';
                
                const mockDecodedToken = { userId: 'user-123' };
                jwt.verify.mockReturnValue(mockDecodedToken);

                authenticateToken(mockReq, mockRes, mockNext);

                expect(jwt.verify).toHaveBeenCalledWith('test-token', 'custom-secret-key');
            });

            test('should handle missing JWT_SECRET environment variable', () => {
                delete process.env.JWT_SECRET;
                mockReq.headers.authorization = 'Bearer test-token';
                
                jwt.verify.mockImplementation(() => {
                    throw new Error('secretOrPrivateKey required');
                });

                authenticateToken(mockReq, mockRes, mockNext);

                expect(mockRes.status).toHaveBeenCalledWith(403);
                expect(mockRes.json).toHaveBeenCalledWith({
                    success: false,
                    message: 'Token validation failed. Access forbidden.'
                });
            });
        });
    });

    describe('optionalAuth middleware', () => {
        let consoleSpy;

        beforeEach(() => {
            consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        });

        afterEach(() => {
            consoleSpy.mockRestore();
        });

        describe('No Authorization Header', () => {
            test('should continue without user data when no authorization header', () => {
                optionalAuth(mockReq, mockRes, mockNext);

                expect(mockReq.user).toBeUndefined();
                expect(mockNext).toHaveBeenCalled();
                expect(mockRes.status).not.toHaveBeenCalled();
                expect(mockRes.json).not.toHaveBeenCalled();
            });

            test('should continue without user data when authorization header is empty', () => {
                mockReq.headers.authorization = '';

                optionalAuth(mockReq, mockRes, mockNext);

                expect(mockReq.user).toBeUndefined();
                expect(mockNext).toHaveBeenCalled();
                expect(mockRes.status).not.toHaveBeenCalled();
            });

            test('should continue without user data when authorization header does not start with Bearer', () => {
                mockReq.headers.authorization = 'Basic some-token';

                optionalAuth(mockReq, mockRes, mockNext);

                expect(mockReq.user).toBeUndefined();
                expect(mockNext).toHaveBeenCalled();
                expect(mockRes.status).not.toHaveBeenCalled();
            });
        });

        describe('Valid Token Scenarios', () => {
            test('should attach user data when valid token is provided', () => {
                const mockDecodedToken = {
                    userId: 'user-123',
                    email: 'test@example.com',
                    role: 'user'
                };
                
                mockReq.headers.authorization = 'Bearer valid-token';
                jwt.verify.mockReturnValue(mockDecodedToken);

                optionalAuth(mockReq, mockRes, mockNext);

                expect(jwt.verify).toHaveBeenCalledWith('valid-token', 'test-secret-key');
                expect(mockReq.user).toEqual(mockDecodedToken);
                expect(mockNext).toHaveBeenCalled();
                expect(mockRes.status).not.toHaveBeenCalled();
            });

            test('should continue without user data when Bearer has no token', () => {
                mockReq.headers.authorization = 'Bearer ';

                optionalAuth(mockReq, mockRes, mockNext);

                expect(mockReq.user).toBeUndefined();
                expect(mockNext).toHaveBeenCalled();
                expect(jwt.verify).not.toHaveBeenCalled();
            });
        });

        describe('Invalid Token Scenarios', () => {
            test('should continue without user data when token is expired', () => {
                mockReq.headers.authorization = 'Bearer expired-token';
                
                const expiredError = new Error('jwt expired');
                expiredError.name = 'TokenExpiredError';
                jwt.verify.mockImplementation(() => {
                    throw expiredError;
                });

                optionalAuth(mockReq, mockRes, mockNext);

                expect(mockReq.user).toBeUndefined();
                expect(mockNext).toHaveBeenCalled();
                expect(mockRes.status).not.toHaveBeenCalled();
                expect(consoleSpy).toHaveBeenCalledWith('Optional auth - invalid token:', 'jwt expired');
            });

            test('should continue without user data when token has invalid signature', () => {
                mockReq.headers.authorization = 'Bearer invalid-token';
                
                const invalidError = new Error('invalid signature');
                invalidError.name = 'JsonWebTokenError';
                jwt.verify.mockImplementation(() => {
                    throw invalidError;
                });

                optionalAuth(mockReq, mockRes, mockNext);

                expect(mockReq.user).toBeUndefined();
                expect(mockNext).toHaveBeenCalled();
                expect(mockRes.status).not.toHaveBeenCalled();
                expect(consoleSpy).toHaveBeenCalledWith('Optional auth - invalid token:', 'invalid signature');
            });

            test('should continue without user data when token is malformed', () => {
                mockReq.headers.authorization = 'Bearer malformed.token';
                
                const malformedError = new Error('jwt malformed');
                malformedError.name = 'JsonWebTokenError';
                jwt.verify.mockImplementation(() => {
                    throw malformedError;
                });

                optionalAuth(mockReq, mockRes, mockNext);

                expect(mockReq.user).toBeUndefined();
                expect(mockNext).toHaveBeenCalled();
                expect(mockRes.status).not.toHaveBeenCalled();
                expect(consoleSpy).toHaveBeenCalledWith('Optional auth - invalid token:', 'jwt malformed');
            });

            test('should handle any JWT verification error gracefully', () => {
                mockReq.headers.authorization = 'Bearer some-token';
                
                const genericError = new Error('Generic JWT error');
                jwt.verify.mockImplementation(() => {
                    throw genericError;
                });

                optionalAuth(mockReq, mockRes, mockNext);

                expect(mockReq.user).toBeUndefined();
                expect(mockNext).toHaveBeenCalled();
                expect(mockRes.status).not.toHaveBeenCalled();
                expect(consoleSpy).toHaveBeenCalledWith('Optional auth - invalid token:', 'Generic JWT error');
            });
        });

        describe('Environment Configuration', () => {
            test('should use JWT_SECRET from environment for optional auth', () => {
                process.env.JWT_SECRET = 'optional-auth-secret';
                mockReq.headers.authorization = 'Bearer test-token';
                
                const mockDecodedToken = { userId: 'user-456' };
                jwt.verify.mockReturnValue(mockDecodedToken);

                optionalAuth(mockReq, mockRes, mockNext);

                expect(jwt.verify).toHaveBeenCalledWith('test-token', 'optional-auth-secret');
                expect(mockReq.user).toEqual(mockDecodedToken);
            });
        });
    });

    describe('Edge Cases and Security', () => {
        test('authenticateToken should not modify request object on error', () => {
            mockReq.headers.authorization = 'Bearer invalid-token';
            mockReq.someProperty = 'original-value';
            
            const invalidError = new Error('invalid token');
            invalidError.name = 'JsonWebTokenError';
            jwt.verify.mockImplementation(() => {
                throw invalidError;
            });

            authenticateToken(mockReq, mockRes, mockNext);

            expect(mockReq.user).toBeUndefined();
            expect(mockReq.someProperty).toBe('original-value');
        });

        test('optionalAuth should not modify request object on error', () => {
            mockReq.headers.authorization = 'Bearer invalid-token';
            mockReq.someProperty = 'original-value';
            
            const invalidError = new Error('invalid token');
            jwt.verify.mockImplementation(() => {
                throw invalidError;
            });

            optionalAuth(mockReq, mockRes, mockNext);

            expect(mockReq.user).toBeUndefined();
            expect(mockReq.someProperty).toBe('original-value');
        });

        test('should handle case-sensitive Bearer token format', () => {
            mockReq.headers.authorization = 'BEARER valid-token';

            authenticateToken(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockNext).not.toHaveBeenCalled();
        });

        test('should handle authorization header with multiple spaces', () => {
            mockReq.headers.authorization = 'Bearer     token-with-spaces';
            
            const mockDecodedToken = { userId: 'user-123' };
            jwt.verify.mockReturnValue(mockDecodedToken);

            authenticateToken(mockReq, mockRes, mockNext);

            expect(jwt.verify).toHaveBeenCalledWith('    token-with-spaces', 'test-secret-key');
            expect(mockReq.user).toEqual(mockDecodedToken);
        });
    });
});