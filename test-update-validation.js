// Simple test to verify our update bar endpoint validation
const request = require('supertest');
const app = require('./src/app');

async function testUpdateValidation() {
  try {
    // Create a mock JWT token (this would normally be valid)
    const mockToken = 'valid.jwt.token';
    
    // Test 1: Should reject hours in request
    const responseWithHours = await request(app)
      .put('/api/bars/test-bar-id')
      .set('Authorization', `Bearer ${mockToken}`)
      .send({
        name: 'Updated Name',
        hours: [{ day_of_week: 0, open_time: '10:00:00', close_time: '22:00:00', is_closed: false }]
      });
    
    console.log('Test 1 - Update with hours:');
    console.log(`Status: ${responseWithHours.status}`);
    console.log(`Body:`, responseWithHours.body);
    
    // Test 2: Should reject tag_ids in request
    const responseWithTags = await request(app)
      .put('/api/bars/test-bar-id')
      .set('Authorization', `Bearer ${mockToken}`)
      .send({
        name: 'Updated Name',
        tag_ids: ['tag1', 'tag2']
      });
    
    console.log('\nTest 2 - Update with tag_ids:');
    console.log(`Status: ${responseWithTags.status}`);
    console.log(`Body:`, responseWithTags.body);
    
    // Test 3: Should allow normal update
    const responseNormal = await request(app)
      .put('/api/bars/test-bar-id')
      .set('Authorization', `Bearer ${mockToken}`)
      .send({
        name: 'Updated Name',
        description: 'Updated description'
      });
    
    console.log('\nTest 3 - Normal update:');
    console.log(`Status: ${responseNormal.status}`);
    console.log(`Body:`, responseNormal.body);
    
  } catch (error) {
    console.error('Test error:', error.message);
  }
}

if (require.main === module) {
  testUpdateValidation();
}