// Test setup file
process.env.NODE_ENV = 'test';

// Mock localStorage BEFORE any imports
Object.defineProperty(global, 'localStorage', {
  value: {
    getItem: jest.fn(() => null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn(),
    length: 0,
    key: jest.fn(() => null),
  },
  writable: true,
  configurable: true,
});
