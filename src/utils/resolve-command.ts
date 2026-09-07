import type { SpawnOptions } from "node:child_process";
import path from "node:path";
import which from "which";
import { pathKey } from "./path-key";
import { _cwd, _env } from "./constants";

export interface ParsedCommand {
	command: string;
	args: Array<string>;
	options: SpawnOptions & { _forceShell?: boolean };
	file?: string | null;
	original: { command: string; args: ReadonlyArray<string> };
}

/**
 * Change the process working directory to `cwd`.
 */
export function enterCwd(cwd?: string) {
	if (cwd == null) return false;

	try {
		process.chdir(cwd);
		return true;
	} catch {
		return false;
	}
}

/**
 * Resolve `parsed.command` to an absolute file path by searching the
 * environment's `PATH`, using the custom `cwd` when one is set.
 */
export function resolveCommandAttempt(parsed: ParsedCommand, withoutPathExt?: boolean) {
	const env = parsed.options.env ?? _env;
	const cwd = parsed.options.cwd?.toString();
	// Worker threads do not have process.chdir()
	const switchCwd = process.chdir as (typeof process.chdir & { disabled?: boolean }) | undefined;
	const shouldSwitchCwd = cwd != null && process.chdir !== undefined && !switchCwd?.disabled;

	// `which` does not support a custom `cwd`, so temporarily switch to it
	const switched = shouldSwitchCwd && enterCwd(cwd);

	try {
		const resolved = which.sync(parsed.command, {
			path: env[pathKey({ env })],
			pathExt: withoutPathExt ? path.delimiter : undefined,
		});

		// Return an absolute path, resolved against the custom `cwd` if one was used
		return path.resolve(cwd ?? "", resolved);
	} catch {
		return null;
	} finally {
		if (switched) {
			process.chdir(_cwd);
		}
	}
}

/**
 * Resolve `parsed.command` to an absolute file path by searching the
 * environment's `PATH`, returning `null` when it cannot be found.
 *
 * @example
 * resolveCommand({ command: "node", args: [], options: {}, original: {...} });
 * //=> "C:\\Program Files\\nodejs\\node.exe"
 *
 * resolveCommand({ command: "no-such-tool", ... });
 * //=> null
 */
export function resolveCommand(parsed: ParsedCommand) {
	return resolveCommandAttempt(parsed) ?? resolveCommandAttempt(parsed, true);
}
