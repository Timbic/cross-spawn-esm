import { _env, _platform } from "./constants.ts";

export interface PathKeyOptions {
	/**
	 * Use a custom environment variables object.
	 */
	readonly env?: NodeJS.ProcessEnv;
	/**
	 * Get the PATH key for a specific platform.
	 */
	readonly platform?: NodeJS.Platform;
}

/**
 * Get the [PATH] environment variable key cross-platform.
 * @see https://en.wikipedia.org/wiki/PATH_(variable)
 *
 * @example
 * const key = pathKey();
 * const path = process.env[key];
 */
export function pathKey({ env = _env, platform = _platform }: PathKeyOptions = {}) {
	return platform === "win32" ? (Object.keys(env).findLast((key) => key.toUpperCase() === "PATH") ?? "Path") : "PATH";
}
