import { isWin, _env } from "./constants";

export interface PathKeyOptions {
	/**
	 * Use a custom environment variables object.
	 * @default process.env
	 *
	 * @see https://nodejs.org/api/process.html#process_process_env
	 */
	env?: Record<string, string | undefined>;
	/**
	 * Get the PATH key for a specific platform.
	 * @default process.platform
	 *
	 * @see https://nodejs.org/api/process.html#process_process_platform
	 */
	platform?: NodeJS.Platform;
}

/**
 * Get the [PATH] environment variable key cross-platform.
 * @see https://en.wikipedia.org/wiki/PATH_(variable)
 *
 * @example
 * ```
 * const key = pathKey();
 * //=> 'PATH'
 *
 * const PATH = process.env[key];
 * //=> '/usr/local/bin:/usr/bin:/bin'
 */
export function pathKey(options?: PathKeyOptions) {
	if (options?.platform ?? isWin) return "PATH";

	return (
		Object.keys(options?.env ?? _env)
			.reverse()
			.find((key) => key.toUpperCase() === "PATH") || "Path"
	);
}
