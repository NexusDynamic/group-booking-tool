/**
 * Shared test database helpers.
 *
 * Problem these solve: every test file previously duplicated a hand-written
 * DDL string that had to be kept in sync with schema.ts manually.  Instead,
 * we derive CREATE statements at test time directly from the Drizzle schema
 * objects using drizzle-kit's programmatic API, so schema changes are
 * reflected automatically.
 *
 * Usage pattern A — for modules that import `./db` internally (need vi.mock):
 *
 *   vi.mock('$env/dynamic/private', () => ({ env: { DATABASE_URL: ':memory:' } }));
 *   const client = new Database(':memory:');
 *   const memDb  = drizzle(client, { schema });
 *   vi.mock('./db', () => ({ db: memDb }));   // must be synchronous
 *   const { someFunction } = await import('./some-module');
 *
 *   beforeAll(async () => applySchema(client));
 *   afterAll(() => client.close());
 *   beforeEach(() => clearTables(client));
 *
 * Usage pattern B — for modules that receive `db` as a parameter (no mock):
 *
 *   const { createTestDb } = await import('./db/test-helpers');
 *   let client: Database.Database;
 *   let db: ReturnType<typeof drizzle>;
 *
 *   beforeAll(async () => ({ client, db } = await createTestDb()));
 *   afterAll(() => client?.close());
 *   beforeEach(() => clearTables(client));
 */

import { generateSQLiteDrizzleJson, generateSQLiteMigration } from 'drizzle-kit/api';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

// Cache the generated SQL so repeated calls within the same vitest worker
// (multiple beforeAll invocations) don't re-invoke drizzle-kit.
let _cachedSql: string[] | null = null;

/**
 * Returns the SQL CREATE TABLE / CREATE INDEX statements for the full
 * application schema, derived live from the Drizzle schema objects.
 * Cached after the first call.
 */
export async function getSchemaStatements(): Promise<string[]> {
	if (_cachedSql) return _cachedSql;
	const [empty, current] = await Promise.all([
		generateSQLiteDrizzleJson({}),
		generateSQLiteDrizzleJson(schema as Record<string, unknown>)
	]);
	_cachedSql = await generateSQLiteMigration(empty, current);
	return _cachedSql;
}

/**
 * Apply the full schema to an existing better-sqlite3 client.
 * Typically called inside beforeAll when the client was created synchronously
 * (required for vi.mock compatibility).
 */
export async function applySchema(client: Database.Database): Promise<void> {
	const stmts = await getSchemaStatements();
	for (const stmt of stmts) {
		client.exec(stmt);
	}
}

/**
 * Create a fresh in-memory SQLite database with the full schema applied.
 * Use this in tests where the module under test takes `db` as a parameter
 * and does not need vi.mock('./db').
 */
export async function createTestDb(): Promise<{
	client: Database.Database;
	db: ReturnType<typeof drizzle<typeof schema>>;
}> {
	const client = new Database(':memory:');
	await applySchema(client);
	const db = drizzle(client, { schema });
	return { client, db };
}

/**
 * Delete all rows from every table in a safe order.
 * Foreign-key enforcement is off by default in better-sqlite3, but we
 * delete leaf-tables first to avoid confusion if it is ever turned on.
 */
export function clearTables(client: Database.Database): void {
	client.exec(`
		DELETE FROM bookings;
		DELETE FROM booking_preferences;
		DELETE FROM sessions;
		DELETE FROM recurrence_templates;
		DELETE FROM reminder_rules;
		DELETE FROM participants;
		DELETE FROM experiments;
		DELETE FROM verification;
		DELETE FROM "session";
		DELETE FROM account;
		DELETE FROM "user";
	`);
}
