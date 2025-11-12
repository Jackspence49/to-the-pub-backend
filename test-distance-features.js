/**
 * Test script to demonstrate the enhanced GET /bars endpoint with distance-based
 * sorting, radius filtering, unit support, and pagination.
 * 
 * Run this after starting the server to test the new functionality.
 */

const http = require('http');

const API_BASE = 'http://localhost:3000';

// Test cases for the enhanced functionality
const testCases = [
  {
    name: 'Basic pagination',
    path: '/bars?page=1&limit=5',
    expectedFeatures: ['pagination metadata', 'limit 5']
  },
  {
    name: 'Basic distance sorting (kilometers)',
    path: '/bars?lat=40.7589&lon=-73.9851&page=1&limit=3',
    expectedFeatures: ['distance_km', 'sorted by distance', 'unit: km', 'pagination']
  },
  {
    name: 'Distance sorting with miles and pagination',
    path: '/bars?lat=40.7589&lon=-73.9851&unit=miles&page=1&limit=10',
    expectedFeatures: ['distance_miles', 'sorted by distance', 'unit: miles', 'pagination']
  },
  {
    name: 'Radius filtering with pagination',
    path: '/bars?lat=40.7589&lon=-73.9851&radius=5&page=1&limit=8',
    expectedFeatures: ['distance_km', 'radius filter', 'within 5km', 'pagination']
  },
  {
    name: 'Radius filtering (3 miles) with pagination',
    path: '/bars?lat=40.7589&lon=-73.9851&radius=3&unit=miles&page=2&limit=5',
    expectedFeatures: ['distance_miles', 'radius filter', 'within 3 miles', 'page 2']
  },
  {
    name: 'Combined with existing filters and pagination',
    path: '/bars?lat=40.7589&lon=-73.9851&radius=10&include=hours,tags&open_now=true&page=1&limit=15',
    expectedFeatures: ['distance_km', 'hours', 'tags', 'open_now', 'radius filter', 'pagination']
  },
  {
    name: 'Default pagination values',
    path: '/bars?lat=40.7589&lon=-73.9851',
    expectedFeatures: ['default page=1', 'default limit=50']
  },
  {
    name: 'Invalid page should return 400',
    path: '/bars?page=0',
    expectedStatus: 400
  },
  {
    name: 'Invalid limit should return 400',
    path: '/bars?limit=101',
    expectedStatus: 400
  },
  {
    name: 'Invalid latitude should return 400',
    path: '/bars?lat=91&lon=-73.9851',
    expectedStatus: 400
  },
  {
    name: 'Invalid radius should return 400',
    path: '/bars?lat=40.7589&lon=-73.9851&radius=-5',
    expectedStatus: 400
  },
  {
    name: 'Invalid unit should return 400',
    path: '/bars?lat=40.7589&lon=-73.9851&unit=invalid',
    expectedStatus: 400
  }
];

function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const url = `${API_BASE}${path}`;
    console.log(`Testing: ${url}`);
    
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          resolve({ statusCode: res.statusCode, body: response });
        } catch (err) {
          resolve({ statusCode: res.statusCode, body: data });
        }
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

async function runTests() {
  console.log('Testing Enhanced Bars API - Distance, Radius & Pagination Features');
  console.log('====================================================================\n');

  for (const testCase of testCases) {
    console.log(`Test: ${testCase.name}`);
    try {
      const result = await makeRequest(testCase.path);
      
      const expectedStatus = testCase.expectedStatus || 200;
      const statusMatch = result.statusCode === expectedStatus;
      
      console.log(`  Status: ${result.statusCode} ${statusMatch ? '✓' : '✗ (expected ' + expectedStatus + ')'}`);
      
      if (result.statusCode === 200 && result.body.success) {
        const data = result.body.data;
        const meta = result.body.meta;
        
        console.log(`  Bars returned: ${data.length}`);
        console.log(`  Total items: ${meta.total || 'unknown'}`);
        console.log(`  Page: ${meta.page || 'not set'} / ${meta.totalPages || 'unknown'}`);
        console.log(`  Limit: ${meta.limit || 'not set'}`);
        console.log(`  Has next page: ${meta.hasNextPage !== undefined ? meta.hasNextPage : 'unknown'}`);
        console.log(`  Has prev page: ${meta.hasPrevPage !== undefined ? meta.hasPrevPage : 'unknown'}`);
        
        if (data.length > 0) {
          const firstBar = data[0];
          const hasDistanceKm = 'distance_km' in firstBar;
          const hasDistanceMiles = 'distance_miles' in firstBar;
          
          if (hasDistanceKm) {
            console.log(`  Distance (km): ${firstBar.distance_km}`);
          }
          if (hasDistanceMiles) {
            console.log(`  Distance (miles): ${firstBar.distance_miles}`);
          }
        }
        
        if (meta.location) {
          console.log(`  Location: ${meta.location.lat}, ${meta.location.lon}`);
          console.log(`  Unit: ${meta.location.unit}`);
          console.log(`  Sorted by distance: ${meta.location.sorted_by_distance}`);
        }
        
        if (meta.filters && meta.filters.radius) {
          console.log(`  Radius filter: ${meta.filters.radius} ${meta.filters.unit}`);
        }
        
        console.log('  ✓ Success');
      } else if (result.statusCode >= 400) {
        console.log(`  Error: ${result.body.error || result.body}`);
        console.log('  ✓ Expected error');
      }
      
    } catch (err) {
      console.log(`  ✗ Request failed: ${err.message}`);
    }
    
    console.log('');
  }
  
  console.log('Pagination Examples:');
  console.log('===================');
  console.log('GET /bars?page=1&limit=10          - First 10 bars');
  console.log('GET /bars?page=2&limit=10          - Bars 11-20');
  console.log('GET /bars?lat=40.76&lon=-73.98&page=1&limit=5&radius=3 - First 5 bars within 3km');
  console.log('');
  console.log('Response includes pagination metadata:');
  console.log('- count: Items in current page');
  console.log('- total: Total items matching filters');
  console.log('- page: Current page number');
  console.log('- limit: Items per page');
  console.log('- totalPages: Total number of pages');
  console.log('- hasNextPage: Whether there is a next page');
  console.log('- hasPrevPage: Whether there is a previous page');
}

// Check if server is running before starting tests
http.get(`${API_BASE}/bars`, (res) => {
  console.log('Server is running. Starting tests...\n');
  runTests();
}).on('error', (err) => {
  console.log('Error: Server is not running. Please start the server first.');
  console.log('Run: npm start');
  process.exit(1);
});