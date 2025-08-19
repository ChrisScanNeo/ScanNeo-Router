// Add custom jest matchers
import '@testing-library/jest-dom';

// Mock environment variables for tests
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

// Global test utilities
global.testUtils = {
  // Helper to create mock API responses
  mockApiResponse: (data, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  }),

  // Helper to wait for async operations
  waitFor: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),

  // Helper to create test fixtures from real data
  createFixture: (name, data) => {
    const fs = require('fs');
    const path = require('path');
    const fixturesDir = path.join(__dirname, 'fixtures');
    if (!fs.existsSync(fixturesDir)) {
      fs.mkdirSync(fixturesDir, { recursive: true });
    }
    fs.writeFileSync(path.join(fixturesDir, `${name}.json`), JSON.stringify(data, null, 2));
  },

  // Helper to load test fixtures
  loadFixture: (name) => {
    const fs = require('fs');
    const path = require('path');
    const fixturePath = path.join(__dirname, 'fixtures', `${name}.json`);
    if (fs.existsSync(fixturePath)) {
      return JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    }
    throw new Error(`Fixture ${name} not found`);
  },
};

// Mock timers for testing
beforeEach(() => {
  jest.clearAllMocks();
  jest.clearAllTimers();
});

// Cleanup after tests
afterEach(() => {
  jest.restoreAllMocks();
});
