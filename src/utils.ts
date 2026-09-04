import type { SpawnOptions } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import which from "which";

// ESCAPES

// See http://www.robvanderwoude.com/escapechars.php
const metaChars = /([()\][%!^"`<>&|;, *?])/g;

function escapeCommand(arg: string) {
	return arg.replace(metaChars, "^$1");
}

function escapeArgument(arg: unknown, doubleEscapeMetaChars?: boolean) {
	// Convert to string
	let argStr = `${arg}`;

	// Algorithm below is based on https://qntm.org/cmd
	// It's slightly altered to disable JS backtracking to avoid hanging on specially crafted input
	// Please see https://github.com/moxystudio/node-cross-spawn/pull/160 for more information

	// Sequence of backslashes followed by a double quote:
	// double up all the backslashes and escape the double quote
	argStr = argStr.replace(/(?=(\\+?)?)\1"/g, '$1$1\\"');

	// Sequence of backslashes followed by the end of the string
	// (which will become a double quote later):
	// double up all the backslashes
	argStr = argStr.replace(/(?=(\\+?)?)\1$/, "$1$1");

	// All other backslashes occur literally

	// Quote the whole thing:
	argStr = `"${argStr}"`;

	// Escape meta chars
	argStr = argStr.replace(metaChars, "^$1");

	// Double escape meta chars if necessary
	if (doubleEscapeMetaChars) {
		argStr = argStr.replace(metaChars, "^$1");
	}

	return argStr;
}

// SHEBANG HANDLING

function shebangCommand(string: string) {
	// Check for shebang
	const match = string.match(/^#!(.*)/);
	if (!match) return null;

	// Strip the leading `#!` (and one optional space), then split the interpreter path from its optional argument.
	const [path, argument] = match[0].replace(/#! ?/, "").split(" ");
	// Reduce the interpreter path to its last segment (e.g. `/usr/bin/env` -> `env`).
	const binary = path.split("/").pop();

	return binary === "env" ? argument : argument ? `${binary} ${argument}` : binary;
}

function readShebang(command: string) {
	// Read the first 150 bytes from the file
	const buffer = Buffer.alloc(150);
	try {
		const fd = fs.openSync(command, "r");
		fs.readSync(fd, buffer, 0, 150, 0);
		fs.closeSync(fd);
	} catch {
		return null;
	}

	// Extract shebang
	return shebangCommand(buffer.toString());
}

// RESOLVE COMMAND

export interface Options {
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
function pathKey(options?: Options) {
	if (options?.platform ?? process.platform !== "win32") {
		return "PATH";
	}

	return (
		Object.keys(options?.env ?? process.env)
			.reverse()
			.find((key) => key.toUpperCase() === "PATH") || "Path"
	);
}

export interface ParsedCommand {
	command: string;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	args: any[];
	options: SpawnOptions;
	file?: string | null;
	original: {
		command: string;
		args: string[];
	};
}

function resolveCommandAttempt(parsed: ParsedCommand, withoutPathExt?: boolean) {
	const env = parsed.options.env || process.env;
	const hasCustomCwd = parsed.options.cwd != null;
	// Worker threads do not have process.chdir()
	const switchCwd = process.chdir as (typeof process.chdir & { disabled?: boolean }) | undefined;
	const shouldSwitchCwd = hasCustomCwd && process.chdir !== undefined && !switchCwd?.disabled;

	// If a custom `cwd` was specified, we need to change the process cwd
	// because `which` will do stat calls but does not support a custom cwd
	if (shouldSwitchCwd) {
		try {
			process.chdir(parsed.options.cwd?.toString() ?? "");
		} catch {
			/* Empty */
		}
	}

	let resolved;

	try {
		resolved = which.sync(parsed.command, {
			path: env[pathKey({ env })],
			pathExt: withoutPathExt ? path.delimiter : undefined,
		});
	} catch {
		/* Empty */
	} finally {
		if (shouldSwitchCwd) {
			process.chdir(process.cwd());
		}
	}

	// If we successfully resolved, ensure that an absolute path is returned
	// Note that when a custom `cwd` was used, we need to resolve to an absolute path based on it
	if (resolved) {
		resolved = path.resolve(hasCustomCwd ? (parsed.options.cwd?.toString() ?? "") : "", resolved);
	}

	return resolved;
}

function resolveCommand(parsed: ParsedCommand) {
	return resolveCommandAttempt(parsed) || resolveCommandAttempt(parsed, true);
}

export default { escapeCommand, escapeArgument, shebangCommand, readShebang, pathKey, resolveCommandAttempt, resolveCommand };
