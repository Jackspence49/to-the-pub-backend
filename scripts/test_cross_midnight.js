/**
 * Simple test script to verify cross-midnight hours functionality
 * Run this with: node scripts/test_cross_midnight.js
 */

const mysql = require('mysql2/promise');

// Database configuration (adjust as needed)
const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: 'Coolguy123!', // Change this to your password
  database: 'to_the_pub'
};

async function testCrossMidnightHours() {
  let connection;
  
  try {
    // Connect to database
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Connected to database');
    
    // Test 1: Check if crosses_midnight field exists
    console.log('\n📋 Test 1: Checking table structure...');
    const [columns] = await connection.execute('DESCRIBE bar_hours');
    const crossesMidnightColumn = columns.find(col => col.Field === 'crosses_midnight');
    
    if (crossesMidnightColumn) {
      console.log('✅ crosses_midnight field exists');
      console.log(`   Type: ${crossesMidnightColumn.Type}, Default: ${crossesMidnightColumn.Default}`);
    } else {
      console.log('❌ crosses_midnight field missing!');
      return;
    }
    
    // Test 2: Insert test data with cross-midnight hours
    console.log('\n📋 Test 2: Inserting test bar with cross-midnight hours...');
    
    const testBarId = 'test-cross-midnight-bar-123';
    
    // Insert test bar
    await connection.execute(`
      INSERT IGNORE INTO bars (id, name, address_street, address_city, address_state, address_zip, is_active) 
      VALUES (?, 'Test Cross Midnight Bar', '123 Test St', 'Boston', 'MA', '02101', 1)
    `, [testBarId]);
    
    // Insert cross-midnight hours (Monday 10 PM to Tuesday 2 AM)
    await connection.execute(`
      INSERT IGNORE INTO bar_hours (id, bar_id, day_of_week, open_time, close_time, is_closed, crosses_midnight) 
      VALUES (?, ?, 1, '22:00:00', '02:00:00', 0, 1)
    `, ['test-hour-cross-midnight-123', testBarId]);
    
    console.log('✅ Test data inserted');
    
    // Test 3: Query bars with cross-midnight hours
    console.log('\n📋 Test 3: Querying cross-midnight hours...');
    
    const [hourRows] = await connection.execute(`
      SELECT bh.*, b.name as bar_name
      FROM bar_hours bh
      JOIN bars b ON bh.bar_id = b.id
      WHERE bh.crosses_midnight = 1
      AND b.id = ?
    `, [testBarId]);
    
    if (hourRows.length > 0) {
      console.log('✅ Cross-midnight hours found:');
      hourRows.forEach(hour => {
        console.log(`   ${hour.bar_name}: Day ${hour.day_of_week} (${hour.open_time} - ${hour.close_time}), crosses_midnight: ${hour.crosses_midnight}`);
      });
    } else {
      console.log('❌ No cross-midnight hours found');
    }
    
    // Test 4: Test the logic for determining cross-midnight hours
    console.log('\n📋 Test 4: Testing cross-midnight detection logic...');
    
    function testCrossMidnightLogic(openTime, closeTime) {
      const openTimeParts = openTime.split(':').map(Number);
      const closeTimeParts = closeTime.split(':').map(Number);
      
      const crossesMidnight = closeTimeParts[0] < openTimeParts[0] || 
                             (closeTimeParts[0] === openTimeParts[0] && closeTimeParts[1] < openTimeParts[1]);
      
      return crossesMidnight;
    }
    
    const testCases = [
      { open: '22:00:00', close: '02:00:00', expected: true },
      { open: '10:00:00', close: '22:00:00', expected: false },
      { open: '23:30:00', close: '01:30:00', expected: true },
      { open: '12:00:00', close: '12:00:00', expected: false },
    ];
    
    testCases.forEach(testCase => {
      const result = testCrossMidnightLogic(testCase.open, testCase.close);
      const status = result === testCase.expected ? '✅' : '❌';
      console.log(`   ${status} ${testCase.open} - ${testCase.close}: ${result} (expected: ${testCase.expected})`);
    });
    
    // Cleanup test data
    console.log('\n🧹 Cleaning up test data...');
    await connection.execute('DELETE FROM bar_hours WHERE bar_id = ?', [testBarId]);
    await connection.execute('DELETE FROM bars WHERE id = ?', [testBarId]);
    console.log('✅ Test data cleaned up');
    
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
testCrossMidnightHours();