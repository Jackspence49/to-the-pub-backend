// Test setup file
// This file runs before all tests

// Load environment variables for testing
require('dotenv').config();

// Set test environment variables if not already set
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-for-testing-only-not-secure';
process.env.DB_HOST = process.env.DB_HOST || 'localhost';
process.env.DB_USER = process.env.DB_USER || 'test_user';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'test_password';
process.env.DB_NAME = process.env.DB_NAME || 'test_database';
process.env.PORT = process.env.PORT || '3001';

// Suppress console logs during testing (optional)
if (process.env.NODE_ENV === 'test') {
  // Uncomment these lines if you want to suppress console output during tests
  // console.log = jest.fn();
  // console.error = jest.fn();
  // console.warn = jest.fn();
}

// Global test timeout (30 seconds)
jest.setTimeout(30000);

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Clean up after all tests
afterAll(async () => {
  // Give some time for any pending operations to complete
  await new Promise(resolve => setTimeout(resolve, 100));
});