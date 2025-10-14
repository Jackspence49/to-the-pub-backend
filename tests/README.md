# Login Success Tests

This directory contains comprehensive test suites for verifying successful login functionality in the To The Pub backend API.

## Test Files

### 1. `users.test.js` - Core Success Tests
Main test file that verifies successful login with various scenarios:
- ✅ Login with correct credentials returns JWT token and user data
- ✅ Case-insensitive email handling 
- ✅ JWT token expiration validation (24 hours)
- ✅ Handling users without full_name
- ✅ Different user roles (super_admin, venue_owner, staff, manager, user)

### 2. `users.advanced.test.js` - Advanced Success Tests  
Advanced test scenarios using helper functions:
- ✅ Comprehensive response format validation
- ✅ Email normalization testing
- ✅ JWT token timestamp validation
- ✅ Role-based authentication verification
- ✅ Proper error handling for edge cases

### 3. `users.integration.test.js` - Integration Tests
Real database integration tests (requires test database):
- ✅ End-to-end login flow with actual database
- ✅ JWT token usage in protected routes
- ✅ Database cleanup after tests

## Test Helpers

### `authHelpers.js`
Utility functions for consistent test setup:
- `createMockUser()` - Generate test user objects
- `createTestJWT()` - Create valid JWT tokens for testing
- `createLoginCredentials()` - Generate login request data
- `mockDbResponses` - Common database response patterns
- `expectSuccessfulLoginResponse()` - Validate login response format
- `validateJWTToken()` - Verify JWT token structure and content

## Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npx jest tests/controllers/users.test.js

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run only unit tests (mocked database)
npx jest tests/controllers/users.test.js tests/controllers/users.advanced.test.js

# Run only integration tests (requires database)
npx jest tests/controllers/users.integration.test.js
```

## Test Scenarios Covered

### ✅ Successful Authentication
- Valid email and password combinations
- JWT token generation and validation
- Proper response format (200 OK status)
- User data returned without password hash
- Token expiration set to 24 hours

### ✅ Data Handling
- Case-insensitive email login
- Null/empty full_name handling
- Different user roles validation
- Proper password hash verification with bcrypt

### ✅ Security Features
- JWT tokens contain correct payload (userId, email, role)
- Tokens are properly signed with JWT_SECRET
- No sensitive data (password_hash) in responses
- Token expiration validation

### ✅ Response Format
- Consistent JSON structure: `{ data: {...}, token: "..." }`
- Proper HTTP status codes (200 OK)
- Correct Content-Type headers
- Proper error handling for edge cases

## Expected API Response

```json
{
  "data": {
    "id": "user-uuid-here",
    "email": "user@example.com", 
    "full_name": "User Full Name",
    "role": "super_admin"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

## JWT Token Structure

The returned JWT token contains:
```json
{
  "userId": "user-uuid-here",
  "email": "user@example.com",
  "role": "super_admin",
  "iat": 1634567890,
  "exp": 1634654290
}
```

## Prerequisites

### For Unit/Advanced Tests:
- Node.js and npm installed
- Jest testing framework
- Dependencies: `supertest`, `bcryptjs`, `jsonwebtoken`, `uuid`

### For Integration Tests:
- MySQL database running
- Test database configured
- Environment variables set in `.env` file:
  ```
  DB_HOST=localhost
  DB_USER=your_user
  DB_PASSWORD=your_password  
  DB_NAME=your_test_db
  JWT_SECRET=your_jwt_secret
  ```

## Test Configuration

The test suite uses Jest with the following configuration:
- Test environment: Node.js
- Test timeout: 30 seconds
- Automatic mock clearing between tests
- ES Module compatibility for uuid package
- Coverage reporting available

## Mock vs Integration Testing

**Unit Tests (Mocked):**
- Fast execution
- No database required
- Isolated testing of login logic
- Perfect for CI/CD pipelines

**Integration Tests:**
- Real database interactions
- Complete end-to-end flow
- Requires test database setup
- Better for local development testing

Both approaches are included to provide comprehensive test coverage while maintaining flexibility for different environments.