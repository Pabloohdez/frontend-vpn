import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isInternalApiConfigured } from '$lib/server/internal-api';

export const prerender = false;

/** Diagnóstico sin exponer la clave (no requiere auth). */
export const GET: RequestHandler = async () => {
	return json(
		{
			internal_api_configured: isInternalApiConfigured(),
			cwd: process.cwd()
		},
		{ headers: { 'cache-control': 'no-store' } }
	);
};
