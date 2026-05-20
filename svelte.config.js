import adapter from '@sveltejs/adapter-node';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		runes: ({ filename }) =>
			filename.split(/[/\\]/).includes('node_modules') ? undefined : true
	},
	kit: {
		adapter: adapter({
			out: 'build',
			precompress: false
		}),
		// CSP gestionada por SvelteKit (hashes auto-calculados para scripts inline).
		csp: {
			mode: 'auto',
			directives: {
				'default-src': ['self'],
				'script-src': ['self'],
				'script-src-attr': ['none'],
				'style-src': ['self', 'unsafe-inline', 'https://fonts.googleapis.com'],
				'font-src': ['self', 'https://fonts.gstatic.com', 'data:'],
				'img-src': ['self', 'data:', 'blob:'],
				'connect-src': ['self'],
				'frame-ancestors': ['none'],
				'form-action': ['self'],
				'base-uri': ['self'],
				'object-src': ['none'],
				// No forzamos upgrade-insecure-requests: en LAN con HTTP rompería la carga de assets (CSS/JS).
			}
		}
	},
	vite: {
		ssr: {
			external: ['pdfkit']
		}
	}
};

export default config;
