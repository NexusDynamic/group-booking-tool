import adapter from '@sveltejs/adapter-node';
import { config as dotenvConfig } from 'dotenv';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { sveltekit } from '@sveltejs/kit/vite';
import mkcert from 'vite-plugin-mkcert';

dotenvConfig();

// BASE_URL is a build-time setting — set it before running `pnpm build` (or
// pass it as a Docker build arg).  Must start with "/" and must NOT end with
// "/" (e.g. "/booking").  Leave empty to serve from the root.
const base = (process.env.BASE_URL ?? '') as '' | `/${string}`;

// ORIGIN is the public-facing origin (e.g. "https://booking.example.org").
// Like BASE_URL it is baked in at build time: SvelteKit uses it for CSRF
// checks when the app runs behind a reverse proxy. It is deliberately not
// applied to the dev server, whose origin is derived from the request.
const origin = process.env.ORIGIN || undefined;

export default defineConfig(({ command, mode }) => ({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// Node adapter — this tool is self-hosted, so we output a Node server
			// that can run behind a reverse proxy. See https://svelte.dev/docs/kit/adapter-node.
			adapter: adapter(),
			// Vitest's browser runner can't serve its test page under a base path.
			paths: {
				base: mode === 'test' ? '' : base,
				origin: command === 'build' ? origin : undefined
			},
			csp: {
				// SvelteKit automatically adds the per-request nonce to script-src,
				// which allows the %sveltekit.nonce% inline script in app.html to pass CSP.
				directives: {
					'default-src': ['self'],
					'script-src': ['self'],
					'style-src': ['self', 'unsafe-inline'],
					'img-src': ['self', 'data:'],
					'font-src': ['self', 'data:'],
					'connect-src': ['self'],
					'form-action': ['self'],
					'frame-ancestors': ['none'],
					'base-uri': ['self']
				}
			}
		}),
		mkcert()
	],
	server: { https: {}, proxy: {} },
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**']
				}
			},

			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
}));
