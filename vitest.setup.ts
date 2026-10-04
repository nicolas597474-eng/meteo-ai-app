import { config } from 'dotenv';
import path from 'path';
import type { SetupContext } from 'vitest';

// Load test environment variables
export function setup() {
  config({ path: path.resolve(process.cwd(), '.env.test') });
  config({ path: path.resolve(process.cwd(), '.env') });
}

export default setup;
