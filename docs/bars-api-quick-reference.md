# Bars API Quick Reference

## Base URL
`/api/bars`

## Public Endpoints (No Auth)
| Method | Endpoint | Description | Key Parameters |
|--------|----------|-------------|----------------|
| GET | `/bars` | List all bars with filtering | `include`, `tag`, `city`, `open_now`, `has_events`, `page`, `limit` |
| GET | `/bars/:id` | Get single bar | `include` (default: `hours,tags`) |
| GET | `/bars/search/name` | Search by name | `q` (required), `include` |

## Protected Endpoints (JWT Required)
| Method | Endpoint | Description | Auth Header |
|--------|----------|-------------|-------------|
| POST | `/bars` | Create bar | `Authorization: Bearer <token>` |
| PUT | `/bars/:id` | Update bar info (excludes hours/tags) | `Authorization: Bearer <token>` |
| DELETE | `/bars/:id` | Delete bar (soft) | `Authorization: Bearer <token>` |

## Include Options
- `hours` - Operating hours (day_of_week, open_time, close_time, is_closed)
- `tags` - Associated tags (id, name, category)
- `events` - Upcoming events (id, name, event_date, start_time, event_type)

## Required Fields for Creation
- `name`
- `address_street`
- `address_city`
- `address_state`
- `address_zip`

## Common Response Codes
- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized (no token)
- `403` - Forbidden (invalid token)
- `404` - Not Found
- `409` - Conflict (duplicate)
- `500` - Server Error

## Quick Examples

### Get bars with hours and tags
```bash
GET /api/bars?include=hours,tags
```

### Search for Irish pubs
```bash
GET /api/bars/search/name?q=irish&include=tags
```

### Find sports bars in Boston
```bash
GET /api/bars?tag=Sports%20Bar&city=boston&include=hours
```

### Get currently open bars
```bash
GET /api/bars?open_now=true&include=hours
```

### Get bars with events (paginated)
```bash
GET /api/bars?has_events=true&include=events&page=1&limit=10
```

### Create a new bar
```bash
POST /api/bars
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Test Pub",
  "address_street": "123 Main St",
  "address_city": "Boston",
  "address_state": "MA",
  "address_zip": "02101"
}
```

### Update bar name
```bash
PUT /api/bars/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "New Name"
}
```
**Note:** Only basic bar information can be updated (excludes hours and tags). Including `hours` or `tag_ids` in the request will return a 400 error.

### Soft delete bar
```bash
DELETE /api/bars/:id
Authorization: Bearer <token>
```

## Performance Tips
- Use `include` parameter selectively
- Implement pagination with `page`/`limit` parameters
- Cache frequently accessed data
- Use specific filters to reduce result sets

## Error Handling
- Check response status codes
- Parse error messages from response body
- Handle authentication expiration gracefully
- Validate data before sending requests