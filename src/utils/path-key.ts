import { _env, _platform } from "./constants";

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
 * const key = pathKey();
 * //=> 'PATH'
 *
 * const PATH = process.env[key];
 * //=> '/usr/local/bin:/usr/bin:/bin'
 */
export function pathKey({ env = _env, platform = _platform }: PathKeyOptions) {
	return platform === "win32"
		? (Object.keys(env)
				.reverse()
				.find((key) => key.toUpperCase() === "PATH") ?? "Path")
		: "PATH";
}
