import { isWin, env } from "./variables";

export interface PathKeyOptions {
	/**
	Use a custom environment variables object.

	Default: [`process.env`](https://nodejs.org/api/process.html#process_process_env).
	*/
	env?: Record<string, string | undefined>;
	/**
	Get the PATH key for a specific platform.

	Default: [`process.platform`](https://nodejs.org/api/process.html#process_process_platform).
	*/
	platform?: NodeJS.Platform;
}

/**
Get the [PATH](https://en.wikipedia.org/wiki/PATH_(variable)) environment variable key cross-platform.

@example
```
const key = pathKey();
//=> 'PATH'

const PATH = process.env[key];
//=> '/usr/local/bin:/usr/bin:/bin'
```
*/
export function pathKey(options?: PathKeyOptions) {
	if (options?.platform ?? isWin) return "PATH";

	return (
		Object.keys(options?.env ?? env)
			.reverse()
			.find((key) => key.toUpperCase() === "PATH") || "Path"
	);
}
