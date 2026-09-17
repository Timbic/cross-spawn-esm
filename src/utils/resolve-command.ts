import type { SpawnOptions } from "node:child_process";
import path from "node:path";
import { pathKey } from "./path-key";
import { whichSync } from "./which";
import { _env, isWin } from "./constants";

export interface ParsedCommand {
	command: string;
	args: Array<string>;
	options: SpawnOptions & { _forceShell?: boolean };
	file?: string | null;
	original: { command: string; args: ReadonlyArray<string> };
}

/**
 * Resolve `parsed.command` to an absolute file path by searching the
 * environment's `PATH`, using the custom `cwd` when one is set.
 */
export function resolveCommandAttempt(parsed: ParsedCommand, withoutPathExt?: boolean) {
	const env = parsed.options.env ?? _env;

	return whichSync(parsed.command, {
		cwd: parsed.options.cwd?.toString(),
		path: env[pathKey({ env })],
		pathExt: withoutPathExt ? path.delimiter : undefined,
	});
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
	const attempted = resolveCommandAttempt(parsed);

	// `cmd.exe` (via `PATH`) only locates executables with a `PATHEXT` extension,
	// so a bare filename is retried without extensions on Windows. On POSIX the
	// first attempt already matches exact names, making a second one redundant.
	return attempted ?? (isWin ? resolveCommandAttempt(parsed, true) : null);
}
