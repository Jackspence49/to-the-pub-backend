// Helper function to normalize email addresses
const normalizeEmail = (email = '') => email.trim().toLowerCase();

// Helper function to validate email format
const isValidEmail = (email) => {
  // A standard, robust email regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};


// Utility function to validate password strength
const isValidPassword = (password) => {
  /**
   * Breakdown of the Regex:
   * (?=.*[a-z])    : Must contain at least one lowercase letter
   * (?=.*[A-Z])    : Must contain at least one uppercase letter
   * (?=.*\d)       : Must contain at least one number
   * (?=.*[\W_])    : Must contain at least one special character (non-word char)
   */

  // ✅ Fixed Regex
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{12,}$/;
  
  return passwordRegex.test(password);
};

// Utility to validate E.164 phone format
const isValidPhone = (phone) => {
  // Regex: Starts with +, then 10-15 digits
  const phoneRegex = /^\+[1-9]\d{1,14}$/;
  return phoneRegex.test(phone);
};

const formatPhoneForDB = (rawPhone) => {
  // 1. Remove everything that isn't a digit or a plus sign
  let cleaned = rawPhone.replace(/[^\d+]/g, '');

  // 2. If the user forgot the '+', but provided a 10-digit US number, prepend '+1'
  // (Note: This logic depends on your primary target market)
  if (cleaned.length === 10 && !cleaned.startsWith('+')) {
    cleaned = `+1${cleaned}`;
  }

  return cleaned;
};

//Valid Roles
const VALID_ROLES = ['admin','venue_owner','manager','staff']

const isValidRole = (role) => VALID_ROLES.includes(role)

// Validate Names
const isValidFullName = (name) => {
  if (typeof name !== 'string') return false;
  const trimmed = name.trim();
  // 2–100 chars, letters (including accented/unicode), spaces, hyphens, apostrophes
  return trimmed.length >= 2 && trimmed.length <= 100 && /^[\p{L}\s'\-]+$/u.test(trimmed);
};

const normalizeFullName = (name) => name.trim().replace(/\s+/g, ' ');

module.exports = {
  normalizeEmail,
  isValidEmail,
  isValidPassword,
  isValidPhone,
  formatPhoneForDB,
  isValidRole,
  isValidFullName,
  normalizeFullName
};
