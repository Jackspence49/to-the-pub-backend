const jwt = require('jsonwebtoken');
const { buildToken } = require('../../src/utils/token');

// 1. Mock the jsonwebtoken library
jest.mock('jsonwebtoken');

describe('buildToken', () => {
  const mockId = '12345';
  const mockEmail = 'test@example.com';
  const mockSecret = 'supersecret';
  
  // Set up environment variable before tests
  beforeAll(() => {
    process.env.JWT_SECRET = mockSecret;
  });

  // Clean up after tests
  afterAll(() => {
    delete process.env.JWT_SECRET;
  });

  test('should sign a JWT with correct payload and options', () => {
    // Arrange: Define what sign should return
    const expectedToken = 'fake.jwt.token';
    jwt.sign.mockReturnValue(expectedToken);

    // Act: Call the function
    const token = buildToken({ id: mockId, email: mockEmail });

    // Assert: Check that sign was called with correct arguments
    expect(jwt.sign).toHaveBeenCalledWith(
      {
        userId: mockId,
        email: mockEmail,
        userType: 'app_user',
      },
      mockSecret,
      { expiresIn: '1h' }
    );

    // Assert: Check the returned token
    expect(token).toBe(expectedToken);
  });
});