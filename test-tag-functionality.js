// Test script to verify the event_tag_id functionality
// This script tests that we can create events with event_tag_id and that event_tag_assignments table is removed

const db = require('./src/utils/db');
const { v4: uuidv4 } = require('uuid');

async function testEventTagIdFunctionality() {
  console.log('Testing event_tag_id functionality...');
  
  try {
    // First, let's verify the event_tag_assignments table is removed
    console.log('\n1. Checking that event_tag_assignments table is removed...');
    
    try {
      await db.query("DESCRIBE event_tag_assignments");
      throw new Error('event_tag_assignments table still exists! It should have been removed.');
    } catch (error) {
      if (error.message.includes("doesn't exist")) {
        console.log('✅ event_tag_assignments table successfully removed');
      } else {
        throw error;
      }
    }
    
    console.log('\n2. Checking events table has event_tag_id column...');
    const [eventColumns] = await db.query("SHOW COLUMNS FROM events");
    const hasEventTagId = eventColumns.some(col => col.Field === 'event_tag_id');
    console.log(`event_tag_id column exists: ${hasEventTagId}`);
    
    if (!hasEventTagId) {
      throw new Error('event_tag_id column missing from events table!');
    }
    const [eventTags] = await db.query("SELECT id, name FROM event_tags ORDER BY name LIMIT 5");
    console.log('Available event tags:');
    eventTags.forEach(tag => {
      console.log(`  - ${tag.name} (ID: ${tag.id})`);
    });
    
    if (eventTags.length === 0) {
      throw new Error('No event tags found! Make sure event_tags table is populated.');
    }
    
    // Check that bars exist
    console.log('\n4. Checking for available bars...');
    const [bars] = await db.query("SELECT id, name FROM bars WHERE is_active = 1 LIMIT 1");
    
    if (bars.length === 0) {
      console.log('No bars found, creating a test bar...');
      const barId = uuidv4();
      await db.execute(
        "INSERT INTO bars (id, name, address_street, address_city, address_zip) VALUES (?, ?, ?, ?, ?)",
        [barId, 'Test Bar', '123 Test St', 'Boston', '02101']
      );
      console.log(`Created test bar with ID: ${barId}`);
    } else {
      console.log(`Using existing bar: ${bars[0].name} (ID: ${bars[0].id})`);
    }
    
    // Get the first available bar and tag for testing
    const [availableBars] = await db.query("SELECT id FROM bars WHERE is_active = 1 LIMIT 1");
    const barId = availableBars[0].id;
    const tagId = eventTags[0].id;
    
    // Test creating an event with event_tag_id
    console.log('\n5. Testing event creation with event_tag_id...');
    const eventId = uuidv4();
    const insertEventSql = `
      INSERT INTO events (
        id, bar_id, title, description, start_time, end_time, event_tag_id,
        external_link, recurrence_pattern, recurrence_start_date, recurrence_end_date, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    await db.execute(insertEventSql, [
      eventId,
      barId,
      'Test Event with Event Tag',
      'Testing event_tag_id functionality',
      '19:00:00',
      '21:00:00',
      tagId,
      null,
      'none',
      '2025-01-01',
      '2025-01-01',
      1
    ]);
    
    console.log(`Created event with event_tag_id: ${eventId}`);
    
    // Verify the event was created correctly
    console.log('\n6. Verifying event creation...');
    const [eventResult] = await db.query(`
      SELECT e.id, e.title, et.name as tag_name
      FROM events e
      LEFT JOIN event_tags et ON e.event_tag_id = et.id
      WHERE e.id = ?
    `, [eventId]);
    
    if (eventResult.length > 0) {
      console.log(`✅ Event created successfully:`);
      console.log(`   Title: ${eventResult[0].title}`);
      console.log(`   Tag: ${eventResult[0].tag_name}`);
    } else {
      throw new Error('Event not found after creation!');
    }
    
    // Test the views work without category
    console.log('\n7. Testing views...');
    const [viewResult] = await db.query("SELECT * FROM upcoming_event_instances LIMIT 1");
    console.log(`✅ Views are working (found ${viewResult.length} upcoming instances)`);
    
    // Clean up test data
    console.log('\n8. Cleaning up test data...');
    await db.execute("DELETE FROM events WHERE id = ?", [eventId]);
    console.log('✅ Test data cleaned up');
    
    console.log('\n🎉 All tests passed! The event_tag_id functionality is working correctly.');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

testEventTagIdFunctionality();