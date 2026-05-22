// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare module 'qrcode' {
	export function toDataURL(text: string, options?: Record<string, unknown>): Promise<string>;
	const QRCode: { toDataURL: typeof toDataURL };
	export default QRCode;
}

declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
