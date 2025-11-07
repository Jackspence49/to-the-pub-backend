/**
 * API Usage Examples for the To The Pub Backend
 * 
 * These examples show how to use the flexible bars API endpoints
 * with different include parameters and filters.
 */

const BASE_URL = 'http://localhost:3000/api';

// Example API calls using fetch (for frontend integration)

/**
 * 1. Get all bars with just basic information
 */
async function getBasicBars() {
  const response = await fetch(`${BASE_URL}/bars`);
  const data = await response.json();
  
  console.log('Basic bars:', data);
  // Returns: { success: true, data: [...], meta: { count, included: [], ... } }
}

/**
 * 2. Get all bars with hours and tags included
 */
async function getBarsWithDetails() {
  const response = await fetch(`${BASE_URL}/bars?include=hours,tags`);
  const data = await response.json();
  
  console.log('Bars with hours and tags:', data);
  // Each bar will have hours[] and tags[] arrays
}

/**
 * 3. Get all bars with pagination and all related data
 */
async function getBarsWithPagination() {
  const response = await fetch(`${BASE_URL}/bars?include=hours,tags,events&limit=10&offset=0`);
  const data = await response.json();
  
  console.log('First 10 bars with all data:', data);
  // Limited to 10 results with full details
}

/**
 * 4. Get a single bar with default includes (hours and tags)
 */
async function getSingleBar(barId) {
  const response = await fetch(`${BASE_URL}/bars/${barId}`);
  const data = await response.json();
  
  console.log('Single bar with defaults:', data);
  // Includes hours and tags by default
}

/**
 * 5. Get a single bar with only basic information
 */
async function getSingleBarBasic(barId) {
  const response = await fetch(`${BASE_URL}/bars/${barId}?include=`);
  const data = await response.json();
  
  console.log('Single bar basic info:', data);
  // No related data included
}

/**
 * 6. Get a single bar with events included
 */
async function getSingleBarWithEvents(barId) {
  const response = await fetch(`${BASE_URL}/bars/${barId}?include=hours,tags,events`);
  const data = await response.json();
  
  console.log('Single bar with events:', data);
  // Includes upcoming events
}

/**
 * 7. Filter bars by tag
 */
async function getSportsBars() {
  const response = await fetch(`${BASE_URL}/bars/filter?tag=Sports%20Bar&include=hours`);
  const data = await response.json();
  
  console.log('Sports bars with hours:', data);
  // Only bars tagged as "Sports Bar"
}

/**
 * 8. Filter bars by city with all details
 */
async function getBostonBars() {
  const response = await fetch(`${BASE_URL}/bars/filter?city=boston&include=hours,tags,events`);
  const data = await response.json();
  
  console.log('Boston bars with full details:', data);
  // Only bars in Boston with all related data
}

/**
 * 9. Get bars that are currently open
 */
async function getCurrentlyOpenBars() {
  const response = await fetch(`${BASE_URL}/bars/filter?open_now=true&include=hours`);
  const data = await response.json();
  
  console.log('Currently open bars:', data);
  // Bars that are open right now (requires hours data)
}

/**
 * 10. Get bars with upcoming events
 */
async function getBarsWithEvents() {
  const response = await fetch(`${BASE_URL}/bars/filter?has_events=true&include=events`);
  const data = await response.json();
  
  console.log('Bars with upcoming events:', data);
  // Only bars that have events scheduled
}

/**
 * 11. Complex filtering - Sports bars in Boston that are open now
 */
async function getOpenSportsBarsInBoston() {
  const params = new URLSearchParams({
    tag: 'Sports Bar',
    city: 'boston',
    open_now: 'true',
    include: 'hours,tags,events'
  });
  
  const response = await fetch(`${BASE_URL}/bars/filter?${params}`);
  const data = await response.json();
  
  console.log('Open sports bars in Boston:', data);
  // Very specific filtering with full details
}

/**
 * 12. Search bars by name with includes
 */
async function searchIrishPubs() {
  const response = await fetch(`${BASE_URL}/bars/search/name?q=irish&include=hours,tags`);
  const data = await response.json();
  
  console.log('Irish pubs with details:', data);
  // Search results with hours and tags
}

/**
 * 13. Paginated search with filtering
 */
async function getPaginatedBostonBars(page = 1, pageSize = 5) {
  const offset = (page - 1) * pageSize;
  const params = new URLSearchParams({
    city: 'boston',
    include: 'hours,tags',
    limit: pageSize.toString(),
    offset: offset.toString()
  });
  
  const response = await fetch(`${BASE_URL}/bars/filter?${params}`);
  const data = await response.json();
  
  console.log(`Page ${page} of Boston bars:`, data);
  // Paginated results with metadata
  console.log(`Showing ${data.meta.count} results (limit: ${data.meta.limit}, offset: ${data.meta.offset})`);
}

// Example usage patterns for different scenarios

/**
 * Frontend List View - Just basic info for performance
 */
async function getBarsList() {
  return fetch(`${BASE_URL}/bars?limit=20`);
}

/**
 * Frontend Detail View - Full information
 */
async function getBarDetails(barId) {
  return fetch(`${BASE_URL}/bars/${barId}?include=hours,tags,events`);
}

/**
 * Frontend Search/Filter - Flexible based on user needs
 */
async function searchBars({ query, city, tag, includeHours = false, includeEvents = false }) {
  let url = `${BASE_URL}/bars`;
  const params = new URLSearchParams();
  
  if (query) {
    url += '/search/name';
    params.set('q', query);
  } else {
    url += '/filter';
    if (city) params.set('city', city);
    if (tag) params.set('tag', tag);
  }
  
  // Build include parameter
  const includes = ['tags']; // Always include tags for display
  if (includeHours) includes.push('hours');
  if (includeEvents) includes.push('events');
  params.set('include', includes.join(','));
  
  return fetch(`${url}?${params}`);
}

// Mobile App Examples - Optimized for different views

/**
 * Map View - Just location data
 */
async function getBarsForMap() {
  const response = await fetch(`${BASE_URL}/bars`);
  const data = await response.json();
  
  // Extract only what's needed for map markers
  return data.data.map(bar => ({
    id: bar.id,
    name: bar.name,
    latitude: bar.latitude,
    longitude: bar.longitude,
    address: `${bar.address_street}, ${bar.address_city}`
  }));
}

/**
 * "What's Open Now" Feature
 */
async function getOpenBarsNearby(userCity) {
  const response = await fetch(
    `${BASE_URL}/bars/filter?city=${encodeURIComponent(userCity)}&open_now=true&include=hours,tags`
  );
  return response.json();
}

/**
 * Event Discovery Feature  
 */
async function getUpcomingEvents() {
  const response = await fetch(`${BASE_URL}/bars/filter?has_events=true&include=events`);
  const data = await response.json();
  
  // Flatten events across all bars
  const allEvents = [];
  data.data.forEach(bar => {
    if (bar.upcoming_events) {
      bar.upcoming_events.forEach(event => {
        allEvents.push({
          ...event,
          bar_name: bar.name,
          bar_id: bar.id,
          bar_address: `${bar.address_street}, ${bar.address_city}`
        });
      });
    }
  });
  
  return allEvents.sort((a, b) => new Date(a.event_date) - new Date(b.event_date));
}

// Export functions for use in actual frontend code
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getBasicBars,
    getBarsWithDetails,
    getSingleBar,
    getSportsBars,
    getBostonBars,
    getCurrentlyOpenBars,
    getBarsWithEvents,
    searchIrishPubs,
    searchBars,
    getBarsForMap,
    getOpenBarsNearby,
    getUpcomingEvents
  };
}