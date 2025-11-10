// Load environment variables
require('./config/env');

const request = require('supertest');
const app = require('./src/app');

async function testTagFiltering() {
  try {
    console.log('=== Testing Tag Filtering API ===\n');
    
    // Test 1: Get all bars (no filter)
    console.log('1. Testing GET /bars (no filter)');
    const allBarsResponse = await request(app).get('/bars');
    console.log(`Status: ${allBarsResponse.status}`);
    console.log(`Total bars: ${allBarsResponse.body.data ? allBarsResponse.body.data.length : 'ERROR'}`);
    
    // Test 2: Filter by "Darts"
    console.log('\n2. Testing GET /bars?tag=Darts');
    const dartsResponse = await request(app).get('/bars?tag=Darts');
    console.log(`Status: ${dartsResponse.status}`);
    console.log(`Bars with Darts: ${dartsResponse.body.data ? dartsResponse.body.data.length : 'ERROR'}`);
    
    if (dartsResponse.body.data) {
      console.log('Bars found:');
      dartsResponse.body.data.forEach(bar => {
        console.log(`  - ${bar.name} (${bar.address_city})`);
      });
    } else {
      console.log('Error or no data:', dartsResponse.body);
    }
    
    // Test 3: Filter by "Pool Table"  
    console.log('\n3. Testing GET /bars?tag=Pool Table');
    const poolResponse = await request(app).get('/bars?tag=Pool Table');
    console.log(`Status: ${poolResponse.status}`);
    console.log(`Bars with Pool Table: ${poolResponse.body.data ? poolResponse.body.data.length : 'ERROR'}`);
    
    if (poolResponse.body.data) {
      console.log('Bars found:');
      poolResponse.body.data.forEach(bar => {
        console.log(`  - ${bar.name} (${bar.address_city})`);
      });
    }
    
    // Test 4: Filter by non-existent tag
    console.log('\n4. Testing GET /bars?tag=NonExistentTag');
    const noResultsResponse = await request(app).get('/bars?tag=NonExistentTag');
    console.log(`Status: ${noResultsResponse.status}`);
    console.log(`Bars with NonExistentTag: ${noResultsResponse.body.data ? noResultsResponse.body.data.length : 'ERROR'}`);
    
  } catch (error) {
    console.error('Error testing API:', error);
  } finally {
    process.exit(0);
  }
}

testTagFiltering();