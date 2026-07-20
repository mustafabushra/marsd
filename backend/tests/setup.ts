import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({
  path: path.join(__dirname, '..', '.env.test'),
});

beforeAll(async () => {
  // Setup test database connection if needed
});

afterAll(async () => {
  // Cleanup after all tests
});
