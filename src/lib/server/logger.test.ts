import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { __reconfigureLoggerForTests, logger } from './logger';

describe('logger', () => {
	let stdoutSpy: ReturnType<typeof vi.spyOn>;
	let stderrSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
		stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
		__reconfigureLoggerForTests({ level: 'debug', pretty: false });
	});

	afterEach(() => {
		stdoutSpy.mockRestore();
		stderrSpy.mockRestore();
	});

	it('emite JSON con campos básicos', () => {
		logger.info('hello.world', { foo: 'bar' });
		const out = stdoutSpy.mock.calls.at(-1)?.[0] as string;
		expect(out).toBeDefined();
		const parsed = JSON.parse(out.trim());
		expect(parsed.level).toBe('info');
		expect(parsed.msg).toBe('hello.world');
		expect(parsed.foo).toBe('bar');
		expect(parsed.app).toBe('fronted-vpn');
		expect(typeof parsed.ts).toBe('string');
	});

	it('redacta valores sensibles', () => {
		logger.warn('login.attempt', {
			user: 'alice',
			password: 'secret123',
			authorization: 'Bearer xyz',
			nested: { token: 'abc', ok: true }
		});
		const out = stderrSpy.mock.calls.at(-1)?.[0] as string;
		const parsed = JSON.parse(out.trim());
		expect(parsed.password).toBe('[redacted]');
		expect(parsed.authorization).toBe('[redacted]');
		expect(parsed.nested.token).toBe('[redacted]');
		expect(parsed.nested.ok).toBe(true);
		expect(parsed.user).toBe('alice');
	});

	it('respeta el nivel configurado', () => {
		__reconfigureLoggerForTests({ level: 'warn', pretty: false });
		logger.debug('skip.me');
		logger.info('skip.too');
		logger.warn('keep.me');
		expect(stdoutSpy).not.toHaveBeenCalled();
		expect(stderrSpy).toHaveBeenCalledTimes(1);
	});

	it('child añade bindings persistentes', () => {
		const child = logger.child({ reqId: 'req-42', route: '/dns' });
		child.info('ok');
		const out = stdoutSpy.mock.calls.at(-1)?.[0] as string;
		const parsed = JSON.parse(out.trim());
		expect(parsed.reqId).toBe('req-42');
		expect(parsed.route).toBe('/dns');
	});
});
