import adapter from '@sveltejs/adapter-node';

// BASE_PATH is a build-time setting — set it before running `pnpm build` (or
// pass it as a Docker build arg).  Must start with "/" and must NOT end with
// "/" (e.g. "/booking").  Leave empty to serve from the root.
const base = process.env.BASE_PATH ?? '';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
		// Node adapter — this tool is self-hosted, so we output a Node server
		// that can run behind a reverse proxy. See https://svelte.dev/docs/kit/adapter-node.
		adapter: adapter(),

		paths: { base },

		typescript: {
			config: (config) => ({
				...config,
				include: [...config.include, '../drizzle.config.ts']
			})
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
	}
};

export default config;
