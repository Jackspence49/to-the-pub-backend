/**
 * Demo script showing how to use the distance-based sorting, radius filtering,
 * and pagination functionality for the GET /bars endpoint.
 * 
 * This script demonstrates different ways to request bars with comprehensive
 * filtering, sorting, and pagination options.
 */

const API_BASE = 'http://localhost:3000'; // Adjust as needed

/**
 * Example API calls for distance-based sorting, radius filtering, and pagination
 */

// Example 1: Basic pagination
const example1 = {
  url: `${API_BASE}/bars?page=1&limit=20`,
  description: 'Get first 20 bars (basic pagination)'
};

// Example 2: Distance sorting with pagination
const example2 = {
  url: `${API_BASE}/bars?lat=40.7589&lon=-73.9851&page=1&limit=10`,
  description: 'Get first 10 bars sorted by distance from Times Square'
};

// Example 3: Radius filtering with pagination
const example3 = {
  url: `${API_BASE}/bars?lat=40.7589&lon=-73.9851&radius=5&page=2&limit=15`,
  description: 'Get bars 16-30 within 5km radius, sorted by distance'
};

// Example 4: Miles unit with pagination
const example4 = {
  url: `${API_BASE}/bars?lat=40.7589&lon=-73.9851&radius=3&unit=miles&page=1&limit=5`,
  description: 'Get first 5 bars within 3 miles radius'
};

// Example 5: Combined with all filters and pagination
const example5 = {
  url: `${API_BASE}/bars?lat=40.7589&lon=-73.9851&radius=10&include=hours,tags&open_now=true&page=1&limit=25`,
  description: 'Get first 25 open bars with hours and tags within 10km'
};

// Example 6: Pagination with tag filtering
const example6 = {
  url: `${API_BASE}/bars?tag=tag-uuid-1,tag-uuid-2&page=3&limit=10`,
  description: 'Get bars 21-30 with specific tags'
};

// Example 7: Large result set with small pages
const example7 = {
  url: `${API_BASE}/bars?lat=37.7749&lon=-122.4194&unit=miles&page=5&limit=5`,
  description: 'Get bars 21-25 from San Francisco, distances in miles'
};

console.log('Enhanced Bars API - Distance, Radius & Pagination Examples:\n');
console.log('============================================================\n');

[example1, example2, example3, example4, example5, example6, example7].forEach((example, index) => {
  console.log(`Example ${index + 1}:`);
  console.log(`Description: ${example.description}`);
  console.log(`URL: ${example.url}`);
  console.log('');
});

console.log('Key Features:');
console.log('- Uses Haversine formula for distance calculation');
console.log('- Results are sorted by distance (closest first) when location provided');
console.log('- Optional radius filtering to limit search area');
console.log('- Support for kilometers (default) and miles');
console.log('- Comprehensive pagination with metadata');
console.log('- Only includes bars that have latitude/longitude coordinates for distance features');
console.log('- Distance included in response as "distance_km" or "distance_miles"');
console.log('- Response metadata indicates pagination state and location sorting');
console.log('- Supports all existing filters (tags, open_now, include)');
console.log('');
console.log('Parameters:');
console.log('- lat: User latitude (-90 to 90) [REQUIRED for distance features]');
console.log('- lon: User longitude (-180 to 180) [REQUIRED for distance features]');
console.log('- radius: Maximum distance from user location (positive number)');
console.log('- unit: Distance unit - "km" (default) or "miles"');
console.log('- page: Page number (default: 1, minimum: 1)');
console.log('- limit: Items per page (default: 50, range: 1-100)');
console.log('- All other existing query parameters are supported');
console.log('');
console.log('Response Format:');
console.log(`{
  "success": true,
  "data": [
    {
      "id": "bar-uuid",
      "name": "Bar Name",
      "latitude": 40.7580,
      "longitude": -73.9855,
      "distance_km": 1.23,  // or "distance_miles" when unit=miles
      // ... other bar fields
    }
  ],
  "meta": {
    "count": 10,          // Items in current page
    "total": 156,         // Total items matching filters
    "page": 1,            // Current page number
    "limit": 10,          // Items per page
    "totalPages": 16,     // Total number of pages
    "hasNextPage": true,  // Whether there is a next page
    "hasPrevPage": false, // Whether there is a previous page
    "filters": { 
      "tag": null, 
      "open_now": null,
      "radius": 5,
      "unit": "km"
    },
    "included": [],
    "location": {
      "lat": 40.7589,
      "lon": -73.9851,
      "sorted_by_distance": true,
      "unit": "km"
    }
  }
}`);