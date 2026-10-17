import { useIntegrationDatabase } from "./db/integration-test-database.js";

// Test-only entry for the Backend's integration tests. It empties PostgreSQL before each
// test and closes its pool after, and hands out nothing from Drizzle.
export function resetDatabaseBetweenTests(): void {
  useIntegrationDatabase();
}
