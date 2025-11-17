module.exports = {
  preset: 'ts-jest',
  testEnvironment: '<rootDir>/jest-environment.js',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  setupFiles: ['<rootDir>/src/__tests__/setup.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/__tests__/**',
  ],
  coverageDirectory: 'coverage',
  verbose: true,
  testTimeout: 10000,
  globals: {
    'ts-jest': {
      isolatedModules: true
    }
  }
};
