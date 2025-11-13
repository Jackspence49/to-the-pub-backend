/**
 * Utility functions for handling recurring events and event instances
 */

/**
 * Generate event instances for a recurring event
 * @param {Object} event - The master event object
 * @param {string} event.id - Event ID
 * @param {string} event.recurrence_pattern - 'none', 'daily', 'weekly', 'monthly'
 * @param {Array} event.recurrence_days - Array of day numbers [0-6] where 0=Sunday (required for weekly only)
 * @param {string} event.recurrence_start_date - Start date (YYYY-MM-DD)
 * @param {string} event.recurrence_end_date - End date (YYYY-MM-DD)
 * @returns {Array} Array of instance objects to be inserted
 */
function generateEventInstances(event) {
  if (event.recurrence_pattern === 'none') {
    // For non-recurring events, create a single instance for the start date
    return [{
      event_id: event.id,
      date: event.recurrence_start_date
    }];
  }

  const instances = [];
  const startDate = new Date(event.recurrence_start_date + 'T00:00:00');
  const endDate = new Date(event.recurrence_end_date + 'T00:00:00');
  const currentDate = new Date(startDate);

  // Validate recurrence_days format
  const recurrenceDays = Array.isArray(event.recurrence_days) 
    ? event.recurrence_days 
    : JSON.parse(event.recurrence_days || '[]');

  while (currentDate <= endDate) {
    let shouldCreateInstance = false;

    switch (event.recurrence_pattern) {
      case 'daily':
        shouldCreateInstance = true;
        break;
      
      case 'weekly':
        // Check if current day of week is in recurrence_days
        const dayOfWeek = currentDate.getDay(); // 0=Sunday, 6=Saturday
        shouldCreateInstance = recurrenceDays.includes(dayOfWeek);
        break;
      
      case 'monthly':
        // For monthly, create instance on the same day of month as start date
        const dayOfMonth = currentDate.getDate();
        const startDayOfMonth = startDate.getDate();
        shouldCreateInstance = dayOfMonth === startDayOfMonth;
        break;
    }

    if (shouldCreateInstance) {
      instances.push({
        event_id: event.id,
        date: formatDateForDB(currentDate)
      });
    }

    // Move to next day
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return instances;
}

/**
 * Format a JavaScript Date object for MySQL DATE column (YYYY-MM-DD)
 * @param {Date} date - JavaScript Date object
 * @returns {string} Formatted date string
 */
function formatDateForDB(date) {
  return date.toISOString().split('T')[0];
}

/**
 * Validate recurrence pattern and associated data
 * @param {Object} recurrenceData - Object containing recurrence fields
 * @returns {Object} Validation result with isValid and errors
 */
function validateRecurrenceData(recurrenceData) {
  const { recurrence_pattern, recurrence_days, recurrence_start_date, recurrence_end_date } = recurrenceData;
  const errors = [];

  // Valid patterns
  const validPatterns = ['none', 'daily', 'weekly', 'monthly'];
  if (!validPatterns.includes(recurrence_pattern)) {
    errors.push(`Invalid recurrence_pattern. Must be one of: ${validPatterns.join(', ')}`);
  }

  // For recurring events, start and end dates are required
  if (recurrence_pattern !== 'none') {
    if (!recurrence_start_date) {
      errors.push('recurrence_start_date is required for recurring events');
    }
    if (!recurrence_end_date) {
      errors.push('recurrence_end_date is required for recurring events');
    }

    // Validate date formats
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (recurrence_start_date && !dateRegex.test(recurrence_start_date)) {
      errors.push('recurrence_start_date must be in YYYY-MM-DD format');
    }
    if (recurrence_end_date && !dateRegex.test(recurrence_end_date)) {
      errors.push('recurrence_end_date must be in YYYY-MM-DD format');
    }

    // Check that end date is after start date
    if (recurrence_start_date && recurrence_end_date) {
      if (new Date(recurrence_end_date) <= new Date(recurrence_start_date)) {
        errors.push('recurrence_end_date must be after recurrence_start_date');
      }
    }

    // Validate recurrence_days for weekly patterns only
    if (recurrence_pattern === 'weekly') {
      if (!recurrence_days) {
        errors.push('recurrence_days is required for weekly events');
      } else {
        let daysArray;
        try {
          daysArray = Array.isArray(recurrence_days) ? recurrence_days : JSON.parse(recurrence_days);
        } catch (e) {
          errors.push('recurrence_days must be a valid JSON array');
          return { isValid: false, errors };
        }

        if (!Array.isArray(daysArray) || daysArray.length === 0) {
          errors.push('recurrence_days must be a non-empty array');
        } else {
          // Validate day numbers (0-6)
          const invalidDays = daysArray.filter(day => !Number.isInteger(day) || day < 0 || day > 6);
          if (invalidDays.length > 0) {
            errors.push('recurrence_days must contain only integers from 0-6 (0=Sunday, 6=Saturday)');
          }
        }
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Get day name from day number
 * @param {number} dayNumber - Day number (0=Sunday, 6=Saturday)
 * @returns {string} Day name
 */
function getDayName(dayNumber) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[dayNumber] || 'Unknown';
}

/**
 * Get human-readable recurrence description
 * @param {Object} event - Event object with recurrence data
 * @returns {string} Human-readable description
 */
function getRecurrenceDescription(event) {
  if (event.recurrence_pattern === 'none') {
    return 'One-time event';
  }

  switch (event.recurrence_pattern) {
    case 'daily':
      return 'Daily';
    case 'weekly':
      const recurrenceDays = Array.isArray(event.recurrence_days) 
        ? event.recurrence_days 
        : JSON.parse(event.recurrence_days || '[]');
      const dayNames = recurrenceDays.map(getDayName);
      return `Weekly on ${dayNames.join(', ')}`;
    case 'monthly':
      return 'Monthly';
    default:
      return 'Unknown pattern';
  }
}

module.exports = {
  generateEventInstances,
  formatDateForDB,
  validateRecurrenceData,
  getDayName,
  getRecurrenceDescription
};