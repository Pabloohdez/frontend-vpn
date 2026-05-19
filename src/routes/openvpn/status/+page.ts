import { redirect } from '@sveltejs/kit';

/** Alias legible: /openvpn/status → /status */
export function load() {
	redirect(308, '/status');
}
