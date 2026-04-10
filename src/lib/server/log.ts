import { env } from '$env/dynamic/private';

/**
 * Tiny logger. Writes to stdout/stderr, with optional file append if
 * `LOG_FILE` is set. Keeping this dependency-free avoids pulling in
 * pino/winston just for the handful of places we actually need structured
 * logging (auth events, booking errors).
 *
 * Usage:
 *   log.info('booking created', { sessionId, participantId });
 *   log.error('ics render failed', { error });
 *
 * The second argument is a bag of structured fields — we JSON-stringify the
 * whole thing so log aggregators that parse JSON lines work out of the box.
 */

type Level = 'debug' | 'info' | 'warn' | 'error';

let fileStream: NodeJS.WritableStream | null = null;
// Defer file stream creation to first use so tests that mock
// `$env/dynamic/private` aren't affected on import.
function getStream(): NodeJS.WritableStream | null {
	if (fileStream) return fileStream;
	const path = env.LOG_FILE;
	if (!path) return null;
	// Dynamic require to avoid bundling node:fs into client code if anything
	// ever tries to import this module from the browser.
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const { createWriteStream } = require('node:fs') as typeof import('node:fs');
	fileStream = createWriteStream(path, { flags: 'a' });
	return fileStream;
}

function write(level: Level, msg: string, fields?: Record<string, unknown>) {
	const entry = JSON.stringify({
		ts: new Date().toISOString(),
		level,
		msg,
		...fields
	});
	if (level === 'error') console.error(entry);
	else if (level === 'warn') console.warn(entry);
	else console.log(entry);
	const stream = getStream();
	if (stream) stream.write(entry + '\n');
}

export const log = {
	debug: (msg: string, fields?: Record<string, unknown>) => write('debug', msg, fields),
	info: (msg: string, fields?: Record<string, unknown>) => write('info', msg, fields),
	warn: (msg: string, fields?: Record<string, unknown>) => write('warn', msg, fields),
	error: (msg: string, fields?: Record<string, unknown>) => write('error', msg, fields)
};
