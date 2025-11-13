/**
 * Test script to verify cross-midnight functionality for events
 * Run this with: node scripts/test_event_cross_midnight.js
 */

const mysql = require('mysql2/promise');

// Database configuration (adjust as needed)
const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: 'Coolguy123!', // Change this to your password
  database: 'to_the_pub'
};

async function testEventCrossMidnight() {
  let connection;
  
  try {
    // Connect to database
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Connected to database');
    
    // Test 1: Check if crosses_midnight field exists in both tables
    console.log('\n📋 Test 1: Checking table structures...');
    
    // Check events table
    const [eventsColumns] = await connection.execute('DESCRIBE events');
    const eventsCrossesMidnightColumn = eventsColumns.find(col => col.Field === 'crosses_midnight');
    
    if (eventsCrossesMidnightColumn) {
      console.log('✅ crosses_midnight field exists in events table');
      console.log(`   Type: ${eventsCrossesMidnightColumn.Type}, Default: ${eventsCrossesMidnightColumn.Default}`);
    } else {
      console.log('❌ crosses_midnight field missing from events table!');
    }
    
    // Check event_instances table
    const [instancesColumns] = await connection.execute('DESCRIBE event_instances');
    const instancesCrossesMidnightColumn = instancesColumns.find(col => col.Field === 'crosses_midnight');
    
    if (instancesCrossesMidnightColumn) {
      console.log('✅ crosses_midnight field exists in event_instances table');
      console.log(`   Type: ${instancesCrossesMidnightColumn.Type}, Default: ${instancesCrossesMidnightColumn.Default}`);
    } else {
      console.log('❌ crosses_midnight field missing from event_instances table!');
    }
    
    if (!eventsCrossesMidnightColumn || !instancesCrossesMidnightColumn) {
      console.log('📝 Please run the migration: scripts/migrations/add_crosses_midnight_to_events.sql');
      return;
    }
    
    // Test 2: Test the logic for determining cross-midnight events
    console.log('\n📋 Test 2: Testing cross-midnight detection logic for events...');
    
    function testEventCrossMidnightLogic(startTime, endTime) {
      const startTimeParts = startTime.split(':').map(Number);
      const endTimeParts = endTime.split(':').map(Number);
      
      const crossesMidnight = endTimeParts[0] < startTimeParts[0] || 
                             (endTimeParts[0] === startTimeParts[0] && endTimeParts[1] < startTimeParts[1]);
      
      return crossesMidnight;
    }
    
    const testCases = [
      { start: '23:00:00', end: '02:00:00', expected: true, description: 'Late night event crossing midnight' },
      { start: '10:00:00', end: '22:00:00', expected: false, description: 'Regular daytime event' },
      { start: '22:30:00', end: '01:30:00', expected: true, description: 'Evening to early morning event' },
      { start: '12:00:00', end: '12:00:00', expected: false, description: 'Same start and end time' },
      { start: '18:00:00', end: '23:00:00', expected: false, description: 'Evening event same day' },
      { start: '00:00:00', end: '06:00:00', expected: false, description: 'Early morning event' },
      { start: '23:59:00', end: '00:01:00', expected: true, description: 'Just around midnight' }
    ];
    
    testCases.forEach(testCase => {
      const result = testEventCrossMidnightLogic(testCase.start, testCase.end);
      const status = result === testCase.expected ? '✅' : '❌';
      console.log(`   ${status} ${testCase.start} - ${testCase.end}: ${result} (${testCase.description})`);
    });
    
    // Test 3: Check if any existing events and instances have cross-midnight times
    console.log('\n📋 Test 3: Checking existing events and instances for cross-midnight times...');
    
    const [existingEvents] = await connection.execute(`
      SELECT id, title, start_time, end_time, crosses_midnight
      FROM events 
      WHERE crosses_midnight = 1
      LIMIT 3
    `);
    
    if (existingEvents.length > 0) {
      console.log('✅ Found existing cross-midnight events:');
      existingEvents.forEach(event => {
        console.log(`   ${event.title}: ${event.start_time} - ${event.end_time} (ID: ${event.id})`);
      });
    } else {
      console.log('📝 No existing cross-midnight events found');
    }
    
    const [existingInstances] = await connection.execute(`
      SELECT ei.id, e.title, 
             COALESCE(ei.custom_start_time, e.start_time) as start_time,
             COALESCE(ei.custom_end_time, e.end_time) as end_time,
             ei.crosses_midnight
      FROM event_instances ei
      JOIN events e ON ei.event_id = e.id
      WHERE ei.crosses_midnight = 1
      LIMIT 3
    `);
    
    if (existingInstances.length > 0) {
      console.log('✅ Found existing cross-midnight event instances:');
      existingInstances.forEach(instance => {
        console.log(`   ${instance.title}: ${instance.start_time} - ${instance.end_time} (Instance ID: ${instance.id})`);
      });
    } else {
      console.log('📝 No existing cross-midnight event instances found');
    }
    
    // Test 4: Test creating a cross-midnight event (if test data doesn't exist)
    console.log('\n📋 Test 4: Testing cross-midnight event creation logic...');
    
    const testEventData = {
      title: 'Test Cross Midnight Event',
      start_time: '23:30:00',
      end_time: '02:30:00'
    };
    
    // Simulate the logic from the controller
    const startTime = testEventData.start_time.split(':').map(Number);
    const endTime = testEventData.end_time.split(':').map(Number);
    
    const crossesMidnight = endTime[0] < startTime[0] || 
                           (endTime[0] === startTime[0] && endTime[1] < startTime[1]);
    
    console.log(`   Event: "${testEventData.title}"`);
    console.log(`   Times: ${testEventData.start_time} - ${testEventData.end_time}`);
    console.log(`   Crosses midnight: ${crossesMidnight ? 'YES' : 'NO'}`);
    
    if (crossesMidnight) {
      console.log('✅ Cross-midnight detection working correctly for events');
    } else {
      console.log('❌ Cross-midnight detection failed for test event');
    }
    
    console.log('\n🎉 Event cross-midnight testing completed!');
    
  } catch (error) {
    console.error('❌ Error during testing:', error);
  } finally {
    if (connection) {
      await connection.end();
      console.log('\n✅ Database connection closed');
    }
  }
}

// Run the test
testEventCrossMidnight();