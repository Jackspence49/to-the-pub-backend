// Load environment variables
require('./config/env');
const db = require('./src/utils/db');

async function debugTagFiltering() {
  try {
    console.log('=== Debugging Tag Filtering ===\n');
    
    // 1. Check if tags exist
    console.log('1. Available tags:');
    const [tags] = await db.query('SELECT * FROM tags ORDER BY name');
    console.table(tags);
    
    // 2. Check if bars exist
    console.log('\n2. Available bars:');
    const [bars] = await db.query('SELECT id, name, is_active FROM bars WHERE is_active = 1');
    console.table(bars);
    
    // 3. Check bar_tags relationships
    console.log('\n3. Bar-Tag relationships:');
    const [barTags] = await db.query(`
      SELECT b.name as bar_name, t.name as tag_name, bt.bar_id, bt.tag_id
      FROM bar_tags bt
      JOIN bars b ON bt.bar_id = b.id
      JOIN tags t ON bt.tag_id = t.id
      WHERE b.is_active = 1
      ORDER BY b.name, t.name
    `);
    console.table(barTags);
    
    // 4. Test the actual filtering query for 'Darts'
    console.log('\n4. Testing filter query for "Darts":');
    const testTag = 'Darts';
    
    const selectSql = `
      SELECT DISTINCT b.*, 
             GROUP_CONCAT(DISTINCT CONCAT(t.id, ':', t.name, ':', COALESCE(t.category, ''))) as tags
      FROM bars b
      INNER JOIN bar_tags bt_filter ON b.id = bt_filter.bar_id
      INNER JOIN tags t_filter ON bt_filter.tag_id = t_filter.id
      LEFT JOIN bar_tags bt ON b.id = bt.bar_id
      LEFT JOIN tags t ON bt.tag_id = t.id
      WHERE b.is_active = 1 AND LOWER(t_filter.name) = LOWER(?)
      GROUP BY b.id
      ORDER BY b.name
    `;
    
    const [filteredBars] = await db.query(selectSql, [testTag]);
    console.log(`Bars with tag "${testTag}":`);
    console.table(filteredBars);
    
    // 5. Test without filtering to see all bars
    console.log('\n5. All bars (no filter):');
    const [allBars] = await db.query(`
      SELECT DISTINCT b.*, 
             GROUP_CONCAT(DISTINCT CONCAT(t.id, ':', t.name, ':', COALESCE(t.category, ''))) as tags
      FROM bars b
      LEFT JOIN bar_tags bt ON b.id = bt.bar_id
      LEFT JOIN tags t ON bt.tag_id = t.id
      WHERE b.is_active = 1
      GROUP BY b.id
      ORDER BY b.name
    `);
    console.table(allBars);
    
  } catch (error) {
    console.error('Error debugging:', error);
  } finally {
    process.exit(0);
  }
}

debugTagFiltering();