
const { normalizeEmail, isValidEmail, isValidPassword, formatPhoneForDB, isValidPhone } = require('../../src/utils/user');

describe('User Management Utilities', () => {
  
  describe('Email Utilities', () => {
    test('normalizeEmail should trim and lowercase', () => {
      expect(normalizeEmail('  USER@Example.COM  ')).toBe('user@example.com');
    });

    test('isValidEmail should validate correct formats', () => {
      expect(isValidEmail('test@me.com')).toBe(true);
      expect(isValidEmail('user.name+tag@domain.co.uk')).toBe(true);
    });

    test('isValidEmail should reject invalid formats', () => {
      expect(isValidEmail('plainaddress')).toBe(false);
      expect(isValidEmail('@missing-local.com')).toBe(false);
      expect(isValidEmail('white space@domain.com')).toBe(false);
    });
  });

  describe('Password Validation', () => {
    test('should accept strong passwords', () => {
      expect(isValidPassword('K#7vL9bP2&nQ')).toBe(true);
    });

    test('should reject passwords missing requirements', () => {
      expect(isValidPassword('lowercase123!')).toBe(false); // No uppercase
      expect(isValidPassword('UPPERCASE123!')).toBe(false); // No lowercase
      expect(isValidPassword('NoSpecial123')).toBe(false);  // No special char
      expect(isValidPassword('Ab!1')).toBe(false);          // Too short
    });
  });

  describe('Phone Utilities', () => {
    test('formatPhoneForDB should strip characters', () => {
      expect(formatPhoneForDB('(555) 123-4567')).toBe('+15551234567');
      expect(formatPhoneForDB(' +44 7123 456789 ')).toBe('+447123456789');
    });

    test('isValidPhone should strictly follow E.164', () => {
      expect(isValidPhone('+15551234567')).toBe(true);
      expect(isValidPhone('5551234567')).toBe(false); // Missing '+'
      expect(isValidPhone('+1')).toBe(false);          // Too short
    });
  });
});