const request = require('supertest');
const app = require('./src/app');

async function testExistingEndpoints() {
  console.log('Testing existing bar endpoints...\n');
  
  try {
    // Test GET /bars (should work)
    console.log('1. Testing GET /bars...');
    const response1 = await request(app).get('/bars');
    
    console.log(`Status: ${response1.status}`);
    console.log(`Body: ${JSON.stringify(response1.body, null, 2)}\n`);
    
    // Test GET /bars/:id with non-existent bar
    console.log('2. Testing GET /bars/:id with non-existent bar...');
    const response2 = await request(app).get('/bars/550e8400-e29b-41d4-a716-446655440000');
    
    console.log(`Status: ${response2.status}`);
    console.log(`Body: ${JSON.stringify(response2.body, null, 2)}\n`);
    
  } catch (error) {
    console.error('Error testing endpoints:', error);
  }
}

testExistingEndpoints();