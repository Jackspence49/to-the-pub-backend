const request = require('supertest');
const app = require('./src/app');

async function testNewEndpoints() {
  console.log('Testing new bar hours endpoints...\n');
  
  try {
    // Test GET /bars/:barId/hours with non-existent bar (should return 404)
    console.log('1. Testing GET /bars/:barId/hours with non-existent bar...');
    const response1 = await request(app)
      .get('/api/bars/550e8400-e29b-41d4-a716-446655440000/hours');
    
    console.log(`Status: ${response1.status}`);
    console.log(`Body: ${JSON.stringify(response1.body, null, 2)}\n`);
    
    // Test PUT /bars/:barId/hours with non-existent bar (should return 404)
    console.log('2. Testing PUT /bars/:barId/hours with non-existent bar...');
    const response2 = await request(app)
      .put('/api/bars/550e8400-e29b-41d4-a716-446655440000/hours')
      .send({
        hours: [
          { day_of_week: 0, open_time: "12:00:00", close_time: "23:00:00", is_closed: false }
        ]
      });
    
    console.log(`Status: ${response2.status}`);
    console.log(`Body: ${JSON.stringify(response2.body, null, 2)}\n`);
    
    // Test PUT /bars/:barId/hours with invalid data
    console.log('3. Testing PUT /bars/:barId/hours with invalid data...');
    const response3 = await request(app)
      .put('/api/bars/550e8400-e29b-41d4-a716-446655440000/hours')
      .send({
        hours: "not an array"
      });
    
    console.log(`Status: ${response3.status}`);
    console.log(`Body: ${JSON.stringify(response3.body, null, 2)}\n`);
    
  } catch (error) {
    console.error('Error testing endpoints:', error);
  }
}

testNewEndpoints();