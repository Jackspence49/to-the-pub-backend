# Password Reset API Endpoints

## Overview
The password reset functionality allows users to reset their passwords when they've forgotten them. This is implemented as a two-step process:

1. **Forgot Password**: User provides their email and receives a reset token
2. **Reset Password**: User provides the token and new password to complete the reset

## Prerequisites
Make sure to run the database migration to add the required fields:
```sql
-- Run this SQL script first
USE to_the_pub;

ALTER TABLE web_users 
ADD COLUMN reset_token VARCHAR(255) DEFAULT NULL,
ADD COLUMN reset_token_expires TIMESTAMP NULL DEFAULT NULL;

CREATE INDEX idx_web_users_reset_token ON web_users(reset_token);
```

## Endpoints

### 1. Forgot Password (Initiate Reset)

**Endpoint:** `POST /api/users/forgot-password`

**Description:** Initiates a password reset by generating a secure token and storing it in the database with an expiration time.

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Password reset initiated successfully",
  "resetToken": "uuid-timestamp" // Only included for testing - remove in production
}
```

**Error Responses:**
- `400`: Missing email
- `500`: Server error

**Security Notes:**
- Always returns success even if email doesn't exist (prevents email enumeration)
- Reset token expires after 1 hour
- In production, send the token via email instead of returning it in the response

### 2. Reset Password (Complete Reset)

**Endpoint:** `POST /api/users/reset-password`

**Description:** Completes the password reset by validating the token and updating the user's password.

**Request Body:**
```json
{
  "token": "reset-token-from-previous-step",
  "newPassword": "newSecurePassword123"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Password reset successfully"
}
```

**Error Responses:**
- `400`: Missing token/password, invalid token, expired token, or password too short
- `500`: Server error

**Security Features:**
- Token is single-use (deleted after successful reset)
- Token expires after 1 hour
- Password must be at least 8 characters
- New password is hashed with bcrypt (10 rounds)

## Example Usage

### Step 1: Request Password Reset
```javascript
const response = await fetch('/api/users/forgot-password', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'user@example.com' })
});

const result = await response.json();
// In testing: result.resetToken contains the token
// In production: token would be sent via email
```

### Step 2: Reset Password
```javascript
const response = await fetch('/api/users/reset-password', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ 
    token: 'received-reset-token',
    newPassword: 'myNewPassword123'
  })
});

const result = await response.json();
// Password has been reset if result.success is true
```

## Testing

Run the provided test script to verify functionality:
```bash
# Make sure your server is running first
npm start

# In another terminal, run the test
node examples/test-password-reset.js
```

## Production Considerations

1. **Email Integration**: Replace the token return in `forgotPassword` with actual email sending
2. **Rate Limiting**: Implement rate limiting on the forgot password endpoint
3. **Logging**: Add security logging for password reset attempts
4. **Token Security**: Consider using crypto.randomBytes() for additional token entropy
5. **Email Templates**: Create professional email templates for password reset links

## Security Best Practices

- ✅ Tokens expire after 1 hour
- ✅ Tokens are single-use (deleted after successful reset)
- ✅ No email enumeration (always returns success)
- ✅ Password complexity requirements
- ✅ Secure password hashing with bcrypt
- ✅ Database indexing for efficient token lookups
- ⚠️ **TODO in production**: Send tokens via email, not in API response
- ⚠️ **TODO in production**: Implement rate limiting
- ⚠️ **TODO in production**: Add comprehensive logging