# Enhanced Bars API - Distance, Radius & Pagination Features

## Summary of Changes

This enhancement adds comprehensive distance-based sorting, radius filtering, and pagination to the `GET /bars` endpoint.

### New Features Added

#### 1. Distance-Based Sorting
- **Parameters**: `lat`, `lon`
- **Functionality**: Sort bars by distance from user's location using Haversine formula
- **Output**: Adds `distance_km` or `distance_miles` field to each bar in response
- **Default**: Results sorted by distance (closest first) when location provided

#### 2. Radius Filtering  
- **Parameter**: `radius`
- **Functionality**: Filter bars within specified distance from user location
- **Validation**: Must be positive number, requires `lat`/`lon` parameters
- **Behavior**: Only returns bars within the specified radius

#### 3. Unit Support
- **Parameter**: `unit`
- **Options**: `km` (kilometers, default) or `miles`
- **Functionality**: Controls distance calculation and display units
- **Output**: Distance field becomes `distance_km` or `distance_miles`

#### 4. Pagination Support
- **Parameters**: `page`, `limit`
- **Page**: Page number (default: 1, minimum: 1)
- **Limit**: Items per page (default: 50, range: 1-100)
- **Functionality**: Efficient pagination with comprehensive metadata
- **Performance**: Uses LIMIT/OFFSET with total count query

#### 5. Enhanced Validation
- **Latitude**: Must be between -90 and 90
- **Longitude**: Must be between -180 and 180
- **Radius**: Must be positive number, requires lat/lon
- **Unit**: Must be "km" or "miles", requires lat/lon
- **Page**: Must be positive integer starting from 1
- **Limit**: Must be between 1 and 100
- **Coordinate Filtering**: Only includes bars with valid coordinates when distance features used

#### 6. Event Instance Location Filters
- **Endpoints**: `GET /events` and `GET /events/instances`
- **Parameters**: Same `lat`, `lon`, `radius`, `unit` set as `/bars`
- **Sorting**: Instances ordered by date, time, then distance
- **Output**: Adds `distance_km`/`distance_miles` and mirrors `/bars` metadata (`meta.location`)
- **Radius Filter**: Uses bar coordinates to keep nearby events only

### API Endpoint Updates

#### Enhanced GET /bars

**New Query Parameters:**
```
?lat={latitude}&lon={longitude}&radius={distance}&unit={km|miles}&page={page}&limit={limit}
```

**Example Requests:**
```
GET /bars?page=1&limit=20
GET /bars?lat=40.7589&lon=-73.9851&page=1&limit=10
GET /bars?lat=40.7589&lon=-73.9851&radius=5&page=2&limit=15
GET /bars?lat=40.7589&lon=-73.9851&radius=3&unit=miles&page=1&limit=5
GET /bars?lat=40.7589&lon=-73.9851&radius=10&include=hours,tags&open_now=true&page=1&limit=25
```

#### Enhanced GET /events & /events/instances

**New Query Parameters:**
```
?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD&event_tag_id={uuid}&lat={latitude}&lon={longitude}&radius={distance}&unit={km|miles}&page={page}&limit={limit}
```

**Behavior Updates:**
- Sorts results by `date`, `start_time`, then `distance_{unit}` when coordinates provided
- Filters by bar proximity when `radius` present (requires `lat`/`lon`)
- Adds `distance_km` or `distance_miles` per instance plus `meta.location` mirroring `/bars`
- Works for both `/events` (alias of `/events/instances`) and `/events/instances`

**Example Requests:**
```
GET /events/instances?date_from=2099-12-31&date_to=2099-12-31&lat=40.73&lon=-73.93&radius=50&unit=miles
GET /events?event_tag_id=abc123&lat=40.73&lon=-73.93&unit=km&page=1&limit=10
```

**Response Additions:**
```json
{
  "data": [
    {
      "instance_id": "uuid",
      "date": "2099-12-31",
      "start_time": "17:00:00",
      "distance_miles": 3.42,
      "bar_latitude": 40.7128,
      "bar_longitude": -74.006
    }
  ],
  "meta": {
    "location": {
      "lat": 40.73,
      "lon": -73.93,
      "sorted_by_distance": true,
      "unit": "miles"
    }
  }
}
```

**Enhanced Response Format:**
```json
{
  "success": true,
  "data": [
    {
      "id": "bar-uuid",
      "name": "Bar Name",
      "latitude": 40.7580,
      "longitude": -73.9855,
      "distance_km": 1.23,  // or distance_miles when unit=miles
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
}
```

### Files Modified

#### Core Implementation
- **`src/controllers/bars.js`**: Enhanced `getAllBars()` function with distance calculations, radius filtering, and unit support

#### Tests
- **`tests/controllers/bars.test.js`**: Added comprehensive test cases for new features including:
  - Distance sorting validation
  - Radius filtering tests
  - Unit conversion tests (km/miles)
  - Pagination functionality tests
  - Parameter validation tests (page, limit)
  - Error handling tests
  - Combined feature tests (pagination + distance + radius)

#### Documentation & Examples
- **`examples/distance-sorting-demo.js`**: Updated with radius, unit, and pagination examples
- **`test-distance-features.js`**: Enhanced manual test script for feature validation
- **`docs/distance-features-enhancement.md`**: Complete documentation update

### Technical Implementation Details

#### Distance Calculation
- Uses Haversine formula for accurate distance calculation
- Earth radius constants: 6371 km / 3959 miles
- Results rounded to 2 decimal places
- SQL implementation for efficient database-level calculation

#### Database Queries
- Dynamic SQL construction based on provided parameters
- Efficient filtering with coordinate validation
- Two-query approach: count query for pagination metadata, data query with LIMIT/OFFSET
- Maintains existing JOIN logic for includes (hours, tags, events)
- Optimized ordering: distance first, then name
- Performance-optimized count query (removes unnecessary ORDER BY)

#### Backward Compatibility
- All existing functionality preserved
- New parameters are optional
- Default behavior unchanged when no location provided
- Existing filters (tags, open_now, include) work with distance features

### Error Handling

#### Parameter Validation
```json
// Invalid latitude/longitude
{ "error": "Invalid latitude or longitude. Latitude must be between -90 and 90, longitude between -180 and 180." }

// Invalid radius
{ "error": "Radius must be a positive number." }

// Invalid unit
{ "error": "Unit must be either \"km\" or \"miles\"." }

// Missing coordinates for radius/unit
{ "error": "Radius and unit parameters require both lat and lon to be provided." }

// Invalid page
{ "error": "Page must be a positive integer starting from 1." }

// Invalid limit
{ "error": "Limit must be between 1 and 100." }
```

### Usage Examples

#### Frontend Integration
```javascript
// Get first page of nearby bars within 5km
const response = await fetch('/bars?lat=40.7589&lon=-73.9851&radius=5&page=1&limit=10');
const data = await response.json();

// Handle pagination
if (data.meta.hasNextPage) {
  const nextPage = await fetch(`/bars?lat=40.7589&lon=-73.9851&radius=5&page=${data.meta.page + 1}&limit=10`);
}

// Get bars within 3 miles with hours (page 2)
const response2 = await fetch('/bars?lat=40.7589&lon=-73.9851&radius=3&unit=miles&include=hours&page=2&limit=15');
```

#### Mobile App Integration
```javascript
// Get user's location and implement pagination
navigator.geolocation.getCurrentPosition(async (position) => {
  const { latitude, longitude } = position.coords;
  let currentPage = 1;
  const itemsPerPage = 20;
  
  // Get first page of nearby bars within 2 miles
  const response = await fetch(
    `/bars?lat=${latitude}&lon=${longitude}&radius=2&unit=miles&include=hours&page=${currentPage}&limit=${itemsPerPage}`
  );
  
  const data = await response.json();
  console.log(`Showing ${data.meta.count} of ${data.meta.total} bars`);
  console.log(`Page ${data.meta.page} of ${data.meta.totalPages}`);
  
  // data.data[0].distance_miles contains distance to first bar
  // Use data.meta.hasNextPage to determine if "Load More" button should be shown
});
```

### Performance Considerations

- Distance calculations performed at database level for efficiency
- Coordinate filtering reduces result set size
- Two-query approach: optimized count query + paginated data query
- Count query removes unnecessary ORDER BY clause for better performance
- Maintains existing query optimization patterns
- No additional database indexes required (uses existing lat/lon columns)
- LIMIT/OFFSET used for efficient pagination

### Testing

Run the test suite:
```bash
npm test -- tests/controllers/bars.test.js
```

Manual testing:
```bash
node test-distance-features.js
```

### Future Enhancements

Potential future additions:
- Cursor-based pagination for very large datasets
- Bounding box filtering for very large radius searches
- Distance-based recommendations
- Multiple location support
- Geofencing features
- Advanced sorting options (e.g., by rating + distance)
- Caching strategies for location-based queries