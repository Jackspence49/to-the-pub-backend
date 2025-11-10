# Bars API Documentation

The Bars API provides comprehensive endpoints for managing and retrieving bar data with optional related information. The API supports both public read operations and protected write operations.

## Base URL
All endpoints are prefixed with `/api/bars`

## Authentication

### Getting Authentication Tokens
Before using protected endpoints, you must authenticate through the User Authentication API:
- `POST /api/users/login` - Login to receive JWT token
- `POST /api/users` - Create new user account (signup)

See the [User Authentication API](#user-authentication-api) section below for complete details.

### Public Endpoints (No Authentication Required)
- `GET /api/bars` - List all bars (supports filtering)
- `GET /api/bars/:id` - Get single bar
- `GET /api/bars/search/name` - Search bars by name

### Protected Endpoints (JWT Token Required)
- `POST /api/bars` - Create new bar
- `PUT /api/bars/:id` - Update existing bar
- `DELETE /api/bars/:id` - Soft delete bar

### Authentication Header Format
For protected endpoints, include the JWT token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

## Optional Include Parameter
Most GET endpoints support an `include` query parameter that allows you to specify which related data to fetch:

- `hours` - Operating hours for each day of the week
- `tags` - Tags/categories associated with the bar
- `events` - Upcoming events at the bar

### Example Usage
```
GET /api/bars?include=hours,tags
GET /api/bars/123?include=hours,tags,events
GET /api/bars?tag=sports&include=hours
```

## Endpoints

### 1. Get All Bars
```
GET /api/bars
```

**Query Parameters:**
- `include` (optional) - Comma-separated list: `hours`, `tags`, `events`
- `tag` (optional) - Filter by tag name (case-insensitive) 
- `open_now` (optional) - Filter by bars currently open (`true`/`false`)
- `has_events` (optional) - Filter by bars with upcoming events (`true`/`false`)
- `lat` (optional) - Latitude coordinate for geolocation search (required with `lon`)
- `lon` (optional) - Longitude coordinate for geolocation search (required with `lat`)
- `radius` (optional) - Search radius in specified unit (default: 5, max: 50)
- `unit` (optional) - Distance unit: `miles` or `km` (default: `miles`)
- `page` (optional) - Page number for pagination (default: 1)
- `limit` (optional) - Maximum number of results per page (default: 20)

**Examples:**
```bash
# Basic request - just bar information
GET /api/bars

# Include hours and tags
GET /api/bars?include=hours,tags

# Include all related data with pagination
GET /api/bars?include=hours,tags,events&page=1&limit=10

# Filter by tag
GET /api/bars?tag=Sports%20Bar&include=hours

# Multiple filters
GET /api/bars?tag=Sports%20Bar&open_now=true&include=hours,tags

# Get bars with upcoming events
GET /api/bars?has_events=true&include=events

# Geolocation-based searches
# Find bars within 5 miles of coordinates (Boston area)
GET /api/bars?lat=42.3601&lon=-71.0589&radius=5&unit=miles&include=hours,tags

# Find bars within 10 kilometers with events
GET /api/bars?lat=42.3601&lon=-71.0589&radius=10&unit=km&has_events=true&include=events

# Find nearby sports bars
GET /api/bars?lat=42.3601&lon=-71.0589&radius=3&tag=Sports%20Bar&include=hours
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "bar-uuid",
      "name": "The Local Pub",
      "description": "A cozy neighborhood bar",
      "address_street": "123 Main St",
      "address_city": "Boston",
      "address_state": "MA",
      "address_zip": "02101",
      "latitude": 42.3601,
      "longitude": -71.0589,
      "phone": "(555) 123-4567",
      "website": "https://thelocalpub.com",
      "instagram": "thelocalpub",
      "facebook": "thelocalpub",
      "is_active": 1,
      "created_at": "2023-01-01T12:00:00.000Z",
      "updated_at": "2023-01-01T12:00:00.000Z",
      "hours": [
        {
          "day_of_week": 0,
          "open_time": "12:00:00",
          "close_time": "23:00:00",
          "is_closed": false
        }
      ],
      "tags": [
        {
          "id": "tag-uuid",
          "name": "Sports Bar",
          "category": "type"
        }
      ],
      "upcoming_events": [
        {
          "id": "event-uuid",
          "name": "Trivia Night",
          "event_date": "2023-12-15",
          "start_time": "19:00:00",
          "event_type": "trivia"
        }
      ],
      "distance": 2.34,
      "distanceUnit": "miles"
    }
  ],
  "meta": {
    "count": 1,
    "page": 1,
    "limit": 20,
    "filters": {
      "tag": null,
      "open_now": null,
      "has_events": null,
      "lat": "42.3601",
      "lon": "-71.0589",
      "radius": "5",
      "unit": "miles"
    },
    "included": ["hours", "tags", "events"]
  }
}
```

### 2. Get Single Bar
```
GET /api/bars/:id
```

**Query Parameters:**
- `include` (optional) - Comma-separated list: `hours`, `tags`, `events`
  - Default: `hours,tags` (if no include parameter specified)

**Examples:**
```bash
# Default includes (hours and tags)
GET /api/bars/bar-uuid

# Only basic bar info
GET /api/bars/bar-uuid?include=

# Include specific data
GET /api/bars/bar-uuid?include=hours,events
```

### 3. Search Bars by Name
```
GET /api/bars/search/name
```

**Query Parameters:**
- `q` (required) - Search term for bar name
- `include` (optional) - Comma-separated list: `hours`, `tags`, `events`

**Examples:**
```bash
# Basic name search
GET /api/bars/search/name?q=pub

# Search with includes
GET /api/bars/search/name?q=pub&include=hours,tags
```

## Protected Endpoints (Authentication Required)

### 4. Create New Bar
```
POST /api/bars
```

**Headers:**
- `Authorization: Bearer <jwt-token>` (required)
- `Content-Type: application/json`

**Request Body:**
```json
{
  "name": "The Local Pub",
  "description": "A cozy neighborhood bar",
  "address_street": "123 Main St",
  "address_city": "Boston",
  "address_state": "MA",
  "address_zip": "02101",
  "latitude": 42.3601,
  "longitude": -71.0589,
  "phone": "(555) 123-4567",
  "website": "https://thelocalpub.com",
  "instagram": "thelocalpub",
  "facebook": "thelocalpub",
  "hours": [
    {
      "day_of_week": 0,
      "open_time": "12:00:00",
      "close_time": "23:00:00",
      "is_closed": false
    },
    {
      "day_of_week": 1,
      "open_time": null,
      "close_time": null,
      "is_closed": true
    }
  ],
  "tag_ids": ["tag-uuid-1", "tag-uuid-2"]
}
```

**Required Fields:**
- `name`
- `address_street`
- `address_city`
- `address_state`
- `address_zip`

**Response (201 Created):**
```json
{
  "data": {
    "id": "new-bar-uuid"
  }
}
```

**Error Responses:**
- `400` - Missing required fields
- `401` - No authentication token provided
- `403` - Invalid authentication token
- `409` - Bar with same name and address already exists
- `500` - Server error

### 5. Update Existing Bar
```
PUT /api/bars/:id
```

**Headers:**
- `Authorization: Bearer <jwt-token>` (required)
- `Content-Type: application/json`

**Request Body:**
All fields are optional. Only provided fields will be updated:
```json
{
  "name": "Updated Bar Name",
  "description": "Updated description",
  "address_street": "456 New Street",
  "phone": "(555) 987-6543",
  "hours": [
    {
      "day_of_week": 0,
      "open_time": "11:00:00",
      "close_time": "24:00:00",
      "is_closed": false
    }
  ],
  "tag_ids": ["new-tag-uuid-1", "new-tag-uuid-2"]
}
```

**Notes:**
- If `hours` array is provided, it completely replaces existing hours
- If `tag_ids` array is provided, it completely replaces existing tag relationships
- Duplicate name/address validation applies if name and full address are updated

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Bar updated successfully",
  "data": {
    "id": "bar-uuid"
  }
}
```

**Error Responses:**
- `401` - No authentication token provided
- `403` - Invalid authentication token
- `404` - Bar not found
- `409` - Updated data would create duplicate bar
- `500` - Server error

### 6. Delete Bar (Soft Delete)
```
DELETE /api/bars/:id
```

**Headers:**
- `Authorization: Bearer <jwt-token>` (required)

**Notes:**
- This performs a soft delete by setting `is_active = 0`
- The bar data is preserved but will not appear in public API responses
- Related data (hours, tags, events) remain in the database

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Bar deleted successfully",
  "data": {
    "id": "bar-uuid"
  }
}
```

**Error Responses:**
- `401` - No authentication token provided
- `403` - Invalid authentication token
- `404` - Bar not found or already deleted
- `500` - Server error

## Data Types

### Hours Object
```json
{
  "day_of_week": 0,  // 0=Sunday, 1=Monday, ..., 6=Saturday
  "open_time": "12:00:00",  // 24-hour format or null
  "close_time": "23:00:00", // 24-hour format or null
  "is_closed": false        // true if closed all day
}
```

### Tags Object
```json
{
  "id": "tag-uuid",
  "name": "Sports Bar",
  "category": "type"  // 'type', 'atmosphere', 'amenity', or null
}
```

### Events Object
```json
{
  "id": "event-uuid",
  "name": "Trivia Night",
  "event_date": "2023-12-15",
  "start_time": "19:00:00",  // or null
  "event_type": "trivia"     // or null
}
```

## Geolocation Features

The Bars API supports location-based searches to find bars near a specific geographic coordinate.

### Location Parameters

- **lat** (decimal, required with lon) - Latitude coordinate (-90 to 90)
- **lon** (decimal, required with lat) - Longitude coordinate (-180 to 180)  
- **radius** (decimal, optional) - Search radius (default: 5, max: 50)
- **unit** (string, optional) - Distance unit: 'miles' or 'km' (default: 'miles')

### Validation Rules

- `lat` and `lon` must be provided together or not at all
- Latitude must be between -90 and 90 degrees
- Longitude must be between -180 and 180 degrees
- Radius must be between 0 and 50 (to prevent abuse)
- Unit must be either 'miles' or 'km'

### Response Format

When location parameters are provided:
- Results are sorted by distance (nearest first) instead of alphabetically
- Each bar includes `distance` and `distanceUnit` fields
- Only bars with valid coordinates are returned
- Distance calculation uses the Haversine formula for accuracy

### Examples

```bash
# Find bars within 3 miles of downtown Boston
GET /api/bars?lat=42.3601&lon=-71.0589&radius=3&unit=miles

# Find sports bars within 10 km
GET /api/bars?lat=42.3601&lon=-71.0589&radius=10&unit=km&tag=Sports%20Bar

# Find nearby bars with events (default 5 mile radius)
GET /api/bars?lat=42.3601&lon=-71.0589&has_events=true&include=events
```

### Error Responses

```json
{
  "error": "Both lat and lon parameters must be provided together"
}

{
  "error": "Latitude must be a number between -90 and 90"
}

{
  "error": "Longitude must be a number between -180 and 180"
}

{
  "error": "Radius must be a number between 0 and 50"
}

{
  "error": "Unit must be either \"miles\" or \"km\""
}
```

## Performance Notes

- Only request the data you need using the `include` parameter
- Use pagination (`limit` and `offset`) for large result sets
- The `open_now` filter requires hours data and may be slower
- Filtering by tags or events uses inner joins and may be more efficient than client-side filtering
- Geolocation searches use database geospatial functions for optimal performance
- Geolocation queries automatically filter out bars without coordinate data

## Error Responses

All endpoints return errors in this format:
```json
{
  "error": "Error message description"
}
```

For protected endpoints, authentication errors use this format:
```json
{
  "success": false,
  "message": "Error message description"
}
```

Common HTTP status codes:
- `200` - OK (successful request)
- `201` - Created (successful resource creation)
- `400` - Bad Request (missing required parameters, validation errors)
- `401` - Unauthorized (no authentication token provided)
- `403` - Forbidden (invalid or expired authentication token)
- `404` - Not Found (resource doesn't exist)
- `409` - Conflict (duplicate resource, e.g., bar with same name/address)
- `500` - Internal Server Error

## Complete Usage Examples

### Frontend Integration Example

```javascript
// Basic bar listing for a map view
async function getBarsForMap() {
  const response = await fetch('/api/bars');
  const data = await response.json();
  return data.data.map(bar => ({
    id: bar.id,
    name: bar.name,
    lat: bar.latitude,
    lng: bar.longitude
  }));
}

// Detailed bar view with all information
async function getBarDetails(barId) {
  const response = await fetch(`/api/bars/${barId}?include=hours,tags,events`);
  return response.json();
}

// Search functionality
async function searchBars(query, includeHours = false) {
  const include = includeHours ? 'hours,tags' : 'tags';
  const response = await fetch(`/api/bars/search/name?q=${encodeURIComponent(query)}&include=${include}`);
  return response.json();
}

// Filter bars currently open
async function getOpenBars() {
  const response = await fetch('/api/bars?open_now=true&include=hours');
  return response.json();
}

// Geolocation-based search
async function getNearbyBars(lat, lon, radius = 5, unit = 'miles') {
  const response = await fetch(
    `/api/bars?lat=${lat}&lon=${lon}&radius=${radius}&unit=${unit}&include=hours,tags`
  );
  return response.json();
}

// Find nearby bars with specific criteria
async function findNearbyOpenBars(lat, lon, radius = 3) {
  const response = await fetch(
    `/api/bars?lat=${lat}&lon=${lon}&radius=${radius}&open_now=true&include=hours`
  );
  return response.json();
}

// Get user's location and find nearby bars
async function getBarsNearUser() {
  if (!navigator.geolocation) {
    throw new Error('Geolocation not supported');
  }
  
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          const bars = await getNearbyBars(latitude, longitude, 10);
          resolve(bars);
        } catch (error) {
          reject(error);
        }
      },
      (error) => reject(error)
    );
  });
}
```

### Admin Panel Integration Example

```javascript
// Create a new bar (requires authentication)
async function createBar(barData, token) {
  const response = await fetch('/api/bars', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(barData)
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || error.message);
  }
  
  return response.json();
}

// Update existing bar
async function updateBar(barId, updates, token) {
  const response = await fetch(`/api/bars/${barId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(updates)
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || error.message);
  }
  
  return response.json();
}

// Delete a bar
async function deleteBar(barId, token) {
  const response = await fetch(`/api/bars/${barId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || error.message);
  }
  
  return response.json();
}
```

### Mobile App Example Usage

```javascript
// Find bars near user's location with events
async function getNearbyBarsWithEvents(lat, lon, radius = 5) {
  const response = await fetch(
    `/api/bars?lat=${lat}&lon=${lon}&radius=${radius}&has_events=true&include=events`
  );
  const data = await response.json();
  
  return data.data.map(bar => ({
    id: bar.id,
    name: bar.name,
    address: `${bar.address_street}, ${bar.address_city}`,
    events: bar.upcoming_events
  }));
}

// Get bars open right now
async function getOpenBarsNow(lat, lon, radius = 10) {
  const response = await fetch(
    `/api/bars?lat=${lat}&lon=${lon}&radius=${radius}&open_now=true&include=hours,tags`
  );
  return response.json();
}
```

### Curl Examples

```bash
# Get all bars with basic info
curl "http://localhost:3000/api/bars"

# Get bars with hours and tags
curl "http://localhost:3000/api/bars?include=hours,tags"

# Search for Irish pubs
curl "http://localhost:3000/api/bars/search/name?q=irish&include=hours"

# Get sports bars in Boston
curl "http://localhost:3000/api/bars?tag=Sports%20Bar"

# Get bars currently open
curl "http://localhost:3000/api/bars?open_now=true&include=hours"

# Get bars with upcoming events
curl "http://localhost:3000/api/bars?has_events=true&include=events"

# Multiple filters with pagination
curl "http://localhost:3000/api/bars?has_events=true&include=hours,tags&page=1&limit=5"

# Geolocation-based searches
# Find bars within 5 miles of coordinates (Boston area)
curl "http://localhost:3000/api/bars?lat=42.3601&lon=-71.0589&radius=5&unit=miles&include=hours,tags"

# Find bars within 10 kilometers with events
curl "http://localhost:3000/api/bars?lat=42.3601&lon=-71.0589&radius=10&unit=km&has_events=true&include=events"

# Find nearby sports bars with default radius (5 miles)
curl "http://localhost:3000/api/bars?lat=42.3601&lon=-71.0589&tag=Sports%20Bar&include=hours"

# Get a specific bar with all details
curl "http://localhost:3000/api/bars/bar-uuid?include=hours,tags,events"

# Create a new bar (with authentication)
curl -X POST "http://localhost:3000/api/bars" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "Test Pub",
    "address_street": "123 Test St",
    "address_city": "Boston",
    "address_state": "MA",
    "address_zip": "02101",
    "hours": [
      {"day_of_week": 1, "open_time": "16:00:00", "close_time": "24:00:00", "is_closed": false}
    ]
  }'

# Update a bar
curl -X PUT "http://localhost:3000/api/bars/bar-uuid" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"name": "Updated Pub Name"}'

# Delete a bar
curl -X DELETE "http://localhost:3000/api/bars/bar-uuid" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Best Practices

1. **Performance Optimization**
   - Only request data you need using the `include` parameter
   - Use pagination for large result sets
   - Cache frequently accessed data on the client side

2. **Error Handling**
   - Always check response status codes
   - Handle authentication errors gracefully
   - Provide user-friendly error messages

3. **Security**
   - Store JWT tokens securely
   - Implement token refresh mechanisms
   - Never expose tokens in URLs or logs

4. **Data Management**
   - Validate data before sending to the API
   - Handle partial updates carefully (PUT endpoint replaces arrays completely)
   - Consider the impact of soft deletes on related data