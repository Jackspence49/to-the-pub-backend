# Events API Documentation - Recurring Events Schema

This document describes the updated Events API that supports recurring events with individual instances.

## Schema Overview

### Events Table (Master Events)
The `events` table now stores master event templates with recurrence patterns:

```sql
events:
- id (uuid) - Primary key
- bar_id (uuid) - Foreign key to bars table  
- title (string) - Event title
- description (text) - Event description (optional)
- start_time (TIME) - Default start time (HH:MM:SS)
- end_time (TIME) - Default end time (HH:MM:SS)
- crosses_midnight (boolean) - Whether event times cross midnight (auto-calculated)
- image_url (string) - Default image URL (optional)
- external_link (string) - External link (optional)
- recurrence_pattern (enum) - 'none', 'daily', 'weekly', 'monthly'
- recurrence_days (JSON) - Array of day numbers [0,1,2,3,4,5,6] where 0=Sunday
- recurrence_start_date (DATE) - Start date for recurrence or single event date
- recurrence_end_date (DATE) - End date for recurrence
- is_active (boolean) - Soft delete flag
- created_at, updated_at (timestamps)
```

### Event Instances Table
The `event_instances` table stores individual occurrences:

```sql
event_instances:
- id (uuid) - Primary key for this instance
- event_id (uuid) - Foreign key to parent event
- date (DATE) - Specific date for this instance
- is_cancelled (boolean) - Whether this instance is cancelled
- custom_start_time (TIME) - Override start time for this instance (optional)
- custom_end_time (TIME) - Override end time for this instance (optional) 
- custom_description (text) - Override description for this instance (optional)
- custom_image_url (string) - Override image for this instance (optional)
- created_at, updated_at (timestamps)
```

## API Endpoints

### Create Event
`POST /events`

Creates a master event and generates instances based on recurrence pattern.

**Request Body:**
```json
{
  "bar_id": "uuid",
  "title": "string",
  "description": "string", // optional
  "start_time": "HH:MM:SS",
  "end_time": "HH:MM:SS", 
  "image_url": "string", // optional
  "event_tag_id": "uuid", // event tag UUID from event_tags table
  "external_link": "string", // optional
  "recurrence_pattern": "none|daily|weekly|monthly", // default: "none"
  "recurrence_days": [0,1,2,3,4,5,6], // required for weekly only
  "recurrence_start_date": "YYYY-MM-DD", // required (event date for one-time events)
  "recurrence_end_date": "YYYY-MM-DD" // required for recurring events
}
```

**Note:** Events can cross midnight (e.g., start_time: "23:30:00", end_time: "02:00:00"). The system automatically calculates and stores a `crosses_midnight` field when the end time is earlier than the start time.

**Examples:**

One-time event:
```json
{
  "bar_id": "123e4567-e89b-12d3-a456-426614174000",
  "title": "Live Jazz Night",
  "description": "Special one-night jazz performance",
  "start_time": "20:00:00",
  "end_time": "23:00:00",
  "event_tag_id": "456e7890-e89b-12d3-a456-426614174001",
  "recurrence_pattern": "none",
  "recurrence_start_date": "2024-12-15"
}
```

Weekly recurring event:
```json
{
  "bar_id": "123e4567-e89b-12d3-a456-426614174000", 
  "title": "Trivia Night",
  "start_time": "19:00:00",
  "end_time": "21:00:00",
  "event_tag_id": "789e0123-e89b-12d3-a456-426614174002",
  "recurrence_pattern": "weekly",
  "recurrence_days": [3], // Wednesday (0=Sunday, 3=Wednesday)
  "recurrence_start_date": "2024-01-01",
  "recurrence_end_date": "2024-12-31"
}
```

### Get Event Instances
`GET /events/instances`

Returns event instances (individual occurrences) with filtering and pagination.

**Query Parameters:**
- `bar_id` - Filter by specific bar
- `date_from` - Filter instances from this date (YYYY-MM-DD)
- `date_to` - Filter instances until this date (YYYY-MM-DD)
- `upcoming` - If 'true', only show future instances
- `tag_ids` - Comma-separated list of tag IDs to filter by
- `page` - Page number for pagination (default: 1)
- `limit` - Maximum results per page (default: 20)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "instance_id": "uuid",
      "event_id": "uuid", 
      "date": "2024-12-15",
      "is_cancelled": false,
      "start_time": "20:00:00",
      "end_time": "23:00:00", 
      "description": "Event description",
      "image_url": "url",
      "title": "Event Title",
      "external_link": "url",
      "bar_id": "uuid",
      "bar_name": "Bar Name",
      "address_city": "Boston",
      "address_state": "MA"
    }
  ],
  "meta": {
    "count": 20,
    "total": 150,
    "page": 1,
    "limit": 20,
    "total_pages": 8
  }
}
```

### Get Master Event
`GET /events/:id`

Returns a master event with recurrence info and upcoming instances.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "bar_id": "uuid",
    "title": "Trivia Night",
    "description": "Weekly trivia competition",
    "start_time": "19:00:00",
    "end_time": "21:00:00",
    "recurrence_pattern": "weekly",
    "recurrence_days": [3],
    "recurrence_start_date": "2024-01-01", 
    "recurrence_end_date": "2024-12-31",
    "recurrence_description": "Weekly on Wednesday",
    "bar_name": "The Local Pub",
    "tags": [
      {"id": "uuid", "name": "Trivia"}
    ],
    "upcoming_instances": [
      {
        "instance_id": "uuid",
        "date": "2024-12-18", 
        "is_cancelled": false
      }
    ]
  }
}
```

### Get Event Instance
`GET /event-instances/:instanceId`

Returns details for a specific event instance.

### Update Event Instance  
`PUT /event-instances/:instanceId`

Updates a specific event instance, allowing customization.

**Request Body:**
```json
{
  "is_cancelled": false,
  "custom_start_time": "20:00:00", // optional override
  "custom_end_time": "22:00:00",   // optional override  
  "custom_description": "Special holiday edition", // optional override
  "custom_image_url": "special-image-url" // optional override
}
```

### Get Bar Events
`GET /bars/:barId/events`

Returns master events for a specific bar.

**Query Parameters:**
- `include_instances` - If 'true', include upcoming instances for each event
- `limit` - Maximum results (default: 50)

## Migration Guide

To migrate from the old single events schema to the new recurring events schema:

1. **Backup your data:**
   ```sql
   CREATE TABLE events_backup AS SELECT * FROM events;
   ```

2. **Run the migration script:**
   ```bash
   mysql -u username -p database_name < scripts/migrate_to_recurring_events.sql
   ```

3. **Update your application code to use the new endpoints:**
   - Replace calls to `GET /events` with `GET /events/instances`
   - Update event creation to include recurrence fields
   - Use instance-specific endpoints for individual event modifications

## Database Views

The schema includes helpful views for common queries:

- `upcoming_event_instances` - All future, non-cancelled instances with event details
- `all_event_instances` - All instances (past and future) with event details

These views can be queried directly for optimized performance:

```sql
SELECT * FROM upcoming_event_instances 
WHERE bar_id = ? 
ORDER BY date ASC;
```

## Recurrence Patterns

### None (One-time Events)
- `recurrence_pattern`: "none"
- `recurrence_start_date`: Event date
- `recurrence_end_date`: Same as start date
- `recurrence_days`: null

### Daily
- `recurrence_pattern`: "daily" 
- Creates instance every day between start and end dates
- `recurrence_days`: ignored

### Weekly
- `recurrence_pattern`: "weekly"
- `recurrence_days`: Array of weekdays [0-6] where 0=Sunday
- Creates instances on specified days each week

### Monthly  
- `recurrence_pattern`: "monthly"
- `recurrence_days`: ignored (not required)
- Creates instances on the same day of month as the start date

## Benefits

1. **Flexibility**: Handle both one-time and recurring events
2. **Customization**: Override details for specific instances  
3. **Performance**: Optimized queries with database views
4. **Data Integrity**: Proper foreign key relationships
5. **Scalability**: Efficiently handle large numbers of recurring events