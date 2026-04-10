import adapter from '@sveltejs/adapter-node';

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
