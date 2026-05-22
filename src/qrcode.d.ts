declare module 'qrcode' {
	export function toDataURL(text: string, options?: Record<string, unknown>): Promise<string>;
	const qrcode: { toDataURL: typeof toDataURL };
	export default qrcode;
}
