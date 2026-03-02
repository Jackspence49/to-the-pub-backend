const mockSendMail = jest.fn();

// Must be declared before the module is loaded.
// Jest hoists jest.mock() and also hoists variables starting with 'mock',
// so mockSendMail is available inside the factory even though it looks like
// it's declared below.
jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({
    sendMail: mockSendMail,
  })),
}));

// Set SMTP env vars before email.js is loaded so createTransport receives them
process.env.SMTP_HOST = 'smtp.test.com';
process.env.SMTP_PORT = '587';
process.env.SMTP_SECURE = 'false';
process.env.SMTP_USER = 'testuser@test.com';
process.env.SMTP_PASS = 'testpassword';
process.env.SMTP_FROM = '"To the Pub" <noreply@tothepub.com>';
process.env.FRONTEND_URL = 'http://localhost:3000';

const nodemailer = require('nodemailer');
const { sendPasswordResetEmail } = require('../../src/utils/email');

// Capture the config passed to createTransport at module load time.
// This must happen here — before any beforeEach runs clearAllMocks() and wipes it.
const capturedTransportConfig = nodemailer.createTransport.mock.calls[0][0];

describe('email utility', () => {
  beforeEach(() => {
    mockSendMail.mockResolvedValue({ messageId: '<abc@smtp.test.com>' });
    mockSendMail.mockClear();
  });

  // ─── Transport configuration ───────────────────────────────────────────────

  describe('createTransport configuration', () => {
    test('should have called createTransport on module load', () => {
      expect(capturedTransportConfig).toBeDefined();
    });

    test('should pass SMTP_HOST to createTransport', () => {
      expect(capturedTransportConfig.host).toBe('smtp.test.com');
    });

    test('should parse SMTP_PORT as an integer', () => {
      expect(capturedTransportConfig.port).toBe(587);
      expect(typeof capturedTransportConfig.port).toBe('number');
    });

    test('should set secure to false when SMTP_SECURE is "false"', () => {
      expect(capturedTransportConfig.secure).toBe(false);
    });

    test('should pass SMTP_USER and SMTP_PASS as auth credentials', () => {
      expect(capturedTransportConfig.auth).toEqual({
        user: 'testuser@test.com',
        pass: 'testpassword',
      });
    });
  });

  // ─── sendPasswordResetEmail ─────────────────────────────────────────────────

  describe('sendPasswordResetEmail', () => {
    const testEmail = 'user@example.com';
    const testToken = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';

    test('should call sendMail exactly once', async () => {
      await sendPasswordResetEmail(testEmail, testToken);
      expect(mockSendMail).toHaveBeenCalledTimes(1);
    });

    test('should set "to" to the provided email address', async () => {
      await sendPasswordResetEmail(testEmail, testToken);
      const [mailOptions] = mockSendMail.mock.calls[0];
      expect(mailOptions.to).toBe(testEmail);
    });

    test('should set "from" from SMTP_FROM env var', async () => {
      await sendPasswordResetEmail(testEmail, testToken);
      const [mailOptions] = mockSendMail.mock.calls[0];
      expect(mailOptions.from).toBe('"To the Pub" <noreply@tothepub.com>');
    });

    test('should use the correct subject line', async () => {
      await sendPasswordResetEmail(testEmail, testToken);
      const [mailOptions] = mockSendMail.mock.calls[0];
      expect(mailOptions.subject).toBe('To the Pub: Password Reset Request');
    });

    test('should include the full reset URL in the text body', async () => {
      await sendPasswordResetEmail(testEmail, testToken);
      const [mailOptions] = mockSendMail.mock.calls[0];
      const expectedUrl = `http://localhost:3000/reset-password?token=${testToken}`;
      expect(mailOptions.text).toContain(expectedUrl);
    });

    test('should include the full reset URL in the HTML body', async () => {
      await sendPasswordResetEmail(testEmail, testToken);
      const [mailOptions] = mockSendMail.mock.calls[0];
      const expectedUrl = `http://localhost:3000/reset-password?token=${testToken}`;
      expect(mailOptions.html).toContain(expectedUrl);
    });

    test('should wrap the reset URL in an <a> tag in the HTML body', async () => {
      await sendPasswordResetEmail(testEmail, testToken);
      const [mailOptions] = mockSendMail.mock.calls[0];
      const expectedUrl = `http://localhost:3000/reset-password?token=${testToken}`;
      expect(mailOptions.html).toContain(`href="${expectedUrl}"`);
    });

    test('should use FRONTEND_URL from the environment to build the reset link', async () => {
      const original = process.env.FRONTEND_URL;
      process.env.FRONTEND_URL = 'https://production.tothepub.com';

      await sendPasswordResetEmail(testEmail, testToken);
      const [mailOptions] = mockSendMail.mock.calls[0];

      expect(mailOptions.text).toContain('https://production.tothepub.com/reset-password');
      expect(mailOptions.html).toContain('https://production.tothepub.com/reset-password');

      process.env.FRONTEND_URL = original;
    });

    test('should include the token as a query parameter in the reset URL', async () => {
      await sendPasswordResetEmail(testEmail, testToken);
      const [mailOptions] = mockSendMail.mock.calls[0];
      expect(mailOptions.text).toContain(`?token=${testToken}`);
      expect(mailOptions.html).toContain(`?token=${testToken}`);
    });

    test('should propagate rejection when sendMail throws', async () => {
      const smtpError = new Error('SMTP connection refused');
      mockSendMail.mockRejectedValue(smtpError);

      await expect(sendPasswordResetEmail(testEmail, testToken)).rejects.toThrow(
        'SMTP connection refused'
      );
    });

    test('should work with different valid email addresses', async () => {
      const addresses = ['admin@bar.co.uk', 'user+tag@example.org', 'a@b.io'];

      for (const address of addresses) {
        jest.clearAllMocks();
        mockSendMail.mockResolvedValue({});
        await sendPasswordResetEmail(address, testToken);
        const [mailOptions] = mockSendMail.mock.calls[0];
        expect(mailOptions.to).toBe(address);
      }
    });
  });
});
