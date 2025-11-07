/**
 * Integration test for password reset functionality
 * Run this with: node examples/test-password-reset.js
 * 
 * Prerequisites:
 * 1. Server must be running on localhost:3000
 * 2. Database must be set up with password reset fields
 */

const db = require('../src/utils/db');
const bcrypt = require('bcryptjs');

async function testPasswordReset() {
  try {
    console.log('🔧 Testing password reset functionality...\n');
    
    // First, create a test user
    const testEmail = 'test-reset@example.com';
    const testPassword = 'testpassword123';
    const passwordHash = await bcrypt.hash(testPassword, 10);
    
    console.log('1️⃣ Creating test user...');
    await db.execute(
      'INSERT INTO web_users (id, email, password_hash, full_name, role) VALUES (UUID(), ?, ?, ?, ?) ON DUPLICATE KEY UPDATE password_hash = ?',
      [testEmail, passwordHash, 'Test User', 'user', passwordHash]
    );
    console.log('✅ Test user created/updated');
    
    // Test the forgot password endpoint
    console.log('\n2️⃣ Testing forgot password endpoint...');
    const forgotPasswordResponse = await fetch('http://localhost:3000/api/users/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail })
    });
    
    const forgotPasswordData = await forgotPasswordResponse.json();
    console.log('📧 Forgot password response:', forgotPasswordData);
    
    if (forgotPasswordData.success && forgotPasswordData.resetToken) {
      const resetToken = forgotPasswordData.resetToken;
      console.log('✅ Reset token generated:', resetToken.substring(0, 20) + '...');
      
      // Test the reset password endpoint
      console.log('\n3️⃣ Testing reset password endpoint...');
      const newPassword = 'newpassword456';
      const resetPasswordResponse = await fetch('http://localhost:3000/api/users/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          token: resetToken, 
          newPassword: newPassword 
        })
      });
      
      const resetPasswordData = await resetPasswordResponse.json();
      console.log('🔑 Reset password response:', resetPasswordData);
      
      if (resetPasswordData.success) {
        console.log('✅ Password reset successfully');
        
        // Test login with new password
        console.log('\n4️⃣ Testing login with new password...');
        const loginResponse = await fetch('http://localhost:3000/api/users/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            email: testEmail, 
            password: newPassword 
          })
        });
        
        const loginData = await loginResponse.json();
        if (loginData.token) {
          console.log('✅ Login successful with new password');
          console.log('🎯 JWT Token received:', loginData.token.substring(0, 30) + '...');
        } else {
          console.log('❌ Login failed with new password:', loginData);
        }
        
        // Test that old password no longer works
        console.log('\n5️⃣ Testing that old password is rejected...');
        const oldPasswordResponse = await fetch('http://localhost:3000/api/users/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            email: testEmail, 
            password: testPassword // Old password
          })
        });
        
        const oldPasswordData = await oldPasswordResponse.json();
        if (oldPasswordData.error === 'Invalid credentials') {
          console.log('✅ Old password correctly rejected');
        } else {
          console.log('❌ Old password should have been rejected:', oldPasswordData);
        }
        
      } else {
        console.log('❌ Password reset failed:', resetPasswordData);
      }
    } else {
      console.log('❌ Failed to generate reset token:', forgotPasswordData);
    }
    
    // Test error cases
    console.log('\n6️⃣ Testing error cases...');
    
    // Test invalid token
    const invalidTokenResponse = await fetch('http://localhost:3000/api/users/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        token: 'invalid-token-123',
        newPassword: 'somePassword123'
      })
    });
    
    const invalidTokenData = await invalidTokenResponse.json();
    if (invalidTokenData.error === 'Invalid or expired reset token') {
      console.log('✅ Invalid token correctly rejected');
    } else {
      console.log('❌ Invalid token should have been rejected:', invalidTokenData);
    }
    
    // Test short password
    const shortPasswordResponse = await fetch('http://localhost:3000/api/users/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        token: 'any-token',
        newPassword: '123' // Too short
      })
    });
    
    const shortPasswordData = await shortPasswordResponse.json();
    if (shortPasswordData.error === 'Password must be at least 8 characters') {
      console.log('✅ Short password correctly rejected');
    } else {
      console.log('❌ Short password should have been rejected:', shortPasswordData);
    }
    
    // Cleanup
    console.log('\n7️⃣ Cleaning up test user...');
    await db.execute('DELETE FROM web_users WHERE email = ?', [testEmail]);
    console.log('✅ Test user deleted');
    
    console.log('\n🎉 Password reset functionality test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error('\n💡 Make sure:');
    console.error('   - Server is running on http://localhost:3000');
    console.error('   - Database is connected and has password reset fields');
    console.error('   - JWT_SECRET environment variable is set');
  } finally {
    await db.end();
  }
}

// Only run if this file is executed directly
if (require.main === module) {
  testPasswordReset();
}

module.exports = { testPasswordReset };