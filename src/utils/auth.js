const jwt = require('jsonwebtoken');
require('dotenv').config();

/**
 * JWT Authentication Middleware
 * 
 * Checks the Authorization header for a Bearer token, validates it,
 * and attaches the decoded user data to the request object.
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const authenticateToken = (req, res, next) => {
    // Get the Authorization header
    const authHeader = req.headers['authorization'];
    
    // Check if the header exists and starts with 'Bearer '
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            message: 'Access denied. No token provided or invalid format. Expected: Bearer <token>'
        });
    }
    
    // Extract the token (remove 'Bearer ' prefix)
    const token = authHeader.substring(7); // 'Bearer '.length = 7
    
    // Check if token exists after Bearer
    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Access denied. No token provided.'
        });
    }
    
    try {
        // Verify the token using the JWT secret
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Attach the decoded user data to the request object
        req.user = decoded;
        
        // Call next() to proceed to the next middleware/route handler
        next();
        
    } catch (error) {
        // Handle different JWT errors
        if (error.name === 'TokenExpiredError') {
            return res.status(403).json({
                success: false,
                message: 'Token has expired. Please login again.'
            });
        } else if (error.name === 'JsonWebTokenError') {
            return res.status(403).json({
                success: false,
                message: 'Invalid token. Access forbidden.'
            });
        } else if (error.name === 'NotBeforeError') {
            return res.status(403).json({
                success: false,
                message: 'Token is not active yet.'
            });
        } else {
            return res.status(403).json({
                success: false,
                message: 'Token validation failed. Access forbidden.'
            });
        }
    }
};

/**
 * Optional Authentication Middleware
 * 
 * Similar to authenticateToken but doesn't require a token.
 * If a valid token is provided, it attaches user data to req.user.
 * If no token or invalid token, it continues without user data.
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const optionalAuth = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    
    // If no authorization header, continue without user data
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return next();
    }
    
    const token = authHeader.substring(7);
    
    // If no token after Bearer, continue without user data
    if (!token) {
        return next();
    }
    
    try {
        // Try to verify the token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
    } catch (error) {
        // If token is invalid, continue without user data (don't throw error)
        console.log('Optional auth - invalid token:', error.message);
    }
    
    next();
};

module.exports = {
    authenticateToken,
    optionalAuth
};