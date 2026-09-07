import type { SpawnOptions } from "node:child_process";
import path from "node:path";
import which from "which";
import { pathKey } from "./path-key";
import { _cwd, _env } from "./variables";

export interface ParsedCommand {
	command: string;
	args: ReadonlyArray<string>;
	options: SpawnOptions & { _forceShell?: boolean };
	file?: string | null;
	original: { command: string; args: ReadonlyArray<string> };
}

export function resolveCommandAttempt(parsed: ParsedCommand, withoutPathExt?: boolean) {
	const env = parsed.options.env || _env;
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
			process.chdir(_cwd);
		}
	}

	// If we successfully resolved, ensure that an absolute path is returned
	// Note that when a custom `cwd` was used, we need to resolve to an absolute path based on it
	if (resolved) {
		resolved = path.resolve(hasCustomCwd ? (parsed.options.cwd?.toString() ?? "") : "", resolved);
	}

	return resolved;
}

export function resolveCommand(parsed: ParsedCommand) {
	return resolveCommandAttempt(parsed) || resolveCommandAttempt(parsed, true);
}
