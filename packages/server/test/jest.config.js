/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  globalSetup: '<rootDir>/global-setup.js',
  setupFiles: ['<rootDir>/set-env.js'],
  testMatch: ['<rootDir>/**/*.spec.ts'],
  testTimeout: 30000,
};
