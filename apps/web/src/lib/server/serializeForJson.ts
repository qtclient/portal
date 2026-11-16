/** JSON-safe clone for API responses (BigInt → string, Date → ISO). */
export function serializeForJson<T>(value: T): T {
	return JSON.parse(
		JSON.stringify(value, (_key, current: unknown) => {
			if (typeof current === 'bigint') {
				return current.toString();
			}
			if (current instanceof Date) {
				return current.toISOString();
			}
			return current;
		}),
	) as T;
}
