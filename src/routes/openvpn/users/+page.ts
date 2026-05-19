import { redirect } from '@sveltejs/kit';

/** Alias legible: /openvpn/users → /users */
export function load() {
	redirect(308, '/users');
}
