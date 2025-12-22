/**
 * Utility functions for handling recurring events and event instances
 */



/**
 * Generate event instances for a recurring event, supporting end date or occurrence count
 * @param {Object} event - The master event object
 * @param {string} event.id - Event ID
 * @param {string} event.recurrence_pattern - 'none', 'daily', 'weekly', 'monthly', 'yearly'
 * @param {Array} event.recurrence_days - Array of day numbers [0-6] where 0=Sunday (required for weekly only)
 * @param {string} event.start_date - Start date (YYYY-MM-DD)
 * @param {string} event.recurrence_end_date - End date (YYYY-MM-DD, optional if occurrence count is used)
 * @param {number} event.recurrence_end_occurrences - Number of occurrences (optional, alternative to end date)
 * @returns {Array} Array of instance objects to be inserted
 */
function generateEventInstances(event) {
  if (event.recurrence_pattern === 'none') {
    // For non-recurring events, create a single instance for the start date
    return [{
      event_id: event.id,
      date: event.start_date
    }];
  }

  const instances = [];
  const startDate = new Date(event.start_date + 'T00:00:00');
  const endDate = event.recurrence_end_date ? new Date(event.recurrence_end_date + 'T00:00:00') : null;
  const maxOccurrences = event.recurrence_end_occurrences ? parseInt(event.recurrence_end_occurrences, 10) : null;
  const currentDate = new Date(startDate);
  let occurrenceCount = 0;

  // Validate recurrence_days format
  const recurrenceDays = Array.isArray(event.recurrence_days) 
    ? event.recurrence_days 
    : JSON.parse(event.recurrence_days || '[]');

  while (
    (endDate && currentDate <= endDate) ||
    (maxOccurrences && occurrenceCount < maxOccurrences)
  ) {
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
      case 'yearly':
        // For yearly, create instance on the same month and day as start date
        const month = currentDate.getMonth();
        const day = currentDate.getDate();
        const startMonth = startDate.getMonth();
        const startDay = startDate.getDate();
        shouldCreateInstance = (month === startMonth && day === startDay);
        break;
    }

    if (shouldCreateInstance) {
      instances.push({
        event_id: event.id,
        date: formatDateForDB(currentDate)
      });
      occurrenceCount++;
      // If using occurrence count, stop if reached
      if (maxOccurrences && occurrenceCount >= maxOccurrences) {
        break;
      }
    }

    // Move to next day
    currentDate.setDate(currentDate.getDate() + 1);
    // If using end date and passed it, break
    if (endDate && currentDate > endDate) {
      break;
    }
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
  const { recurrence_pattern, recurrence_days, start_date, recurrence_end_date, recurrence_end_occurrences } = recurrenceData;
  const errors = [];

  // Valid patterns
  const validPatterns = ['none', 'daily', 'weekly', 'monthly', 'yearly'];
  if (!validPatterns.includes(recurrence_pattern)) {
    errors.push(`Invalid recurrence_pattern. Must be one of: ${validPatterns.join(', ')}`);
  }

  // For recurring events, start date is required, and either end date or occurrence count is required
  if (recurrence_pattern !== 'none') {
    if (!start_date) {
      errors.push('start_date is required for recurring events');
    }
    if (!recurrence_end_date && !recurrence_end_occurrences) {
      errors.push('Either recurrence_end_date or recurrence_end_occurrences is required for recurring events');
    }

    // Validate date formats
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (start_date && !dateRegex.test(start_date)) {
      errors.push('start_date must be in YYYY-MM-DD format');
    }
    if (recurrence_end_date && !dateRegex.test(recurrence_end_date)) {
      errors.push('recurrence_end_date must be in YYYY-MM-DD format');
    }

    // Check that end date is after start date if both provided
    if (start_date && recurrence_end_date) {
      if (new Date(recurrence_end_date) <= new Date(start_date)) {
        errors.push('recurrence_end_date must be after start_date');
      }
    }

    // Validate occurrence count if provided
    if (recurrence_end_occurrences !== undefined && recurrence_end_occurrences !== null) {
      const occ = parseInt(recurrence_end_occurrences, 10);
      if (isNaN(occ) || occ <= 0) {
        errors.push('recurrence_end_occurrences must be a positive integer');
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

  let endDesc = '';
  if (event.recurrence_end_occurrences) {
    endDesc = `, ${event.recurrence_end_occurrences} occurrence${event.recurrence_end_occurrences > 1 ? 's' : ''}`;
  } else if (event.recurrence_end_date) {
    endDesc = `, until ${event.recurrence_end_date}`;
  }

  switch (event.recurrence_pattern) {
    case 'daily':
      return `Daily${endDesc}`;
    case 'weekly':
      const recurrenceDays = Array.isArray(event.recurrence_days) 
        ? event.recurrence_days 
        : JSON.parse(event.recurrence_days || '[]');
      const dayNames = recurrenceDays.map(getDayName);
      return `Weekly on ${dayNames.join(', ')}${endDesc}`;
    case 'monthly':
      return `Monthly${endDesc}`;
    case 'yearly':
      return `Yearly${endDesc}`;
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