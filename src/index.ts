import cp, { type SpawnOptions } from "node:child_process";
import { enterCwd, resolveCommand, resolveCommandAttempt, type ParsedCommand } from "./utils/resolve-command.ts";
import { notFoundError, verifyENOENT, hookChildProcess } from "./enoent.ts";
import { shebangCommand, readShebang, detectShebang } from "./utils/shebang.ts";
import { escapeLineBreaks, escapeMetaChars, escapeArgument, escapeCommand } from "./utils/escapes.ts";
import { pathKey, type PathKeyOptions } from "./utils/path-key.ts";
import { parseNonShell, parse } from "./parse.ts";

export type { ParsedCommand, PathKeyOptions };

/**
 * A cross-platform drop-in replacement for `child_process.spawn()`.
 *
 * On POSIX, arguments are forwarded to the native `spawn` unchanged. On
 * Windows the command and its arguments are rewritten so that the correct
 * interpreter is invoked for shebang scripts, special characters and
 * whitespace in arguments are safely escaped for `cmd.exe`, and a missing
 * command (which `cmd.exe` signals with exit status `1` instead of a real
 * `ENOENT`) is surfaced as an `error` event, matching what Node produces on POSIX.
 */
export function spawn(command: string, args: ReadonlyArray<string> = [], options: SpawnOptions = {}) {
	const parsed = parse(command, args, options);
	const spawned = cp.spawn(parsed.command, parsed.args, parsed.options);

	hookChildProcess(spawned, parsed);

	return spawned;
}

/**
 * A cross-platform drop-in replacement for `child_process.spawnSync()`.
 *
 * On POSIX, arguments are forwarded to the native `spawnSync` unchanged. On
 * Windows the same shebang resolution, argument escaping, and ENOENT
 * detection applied by {@link spawn} are performed synchronously, so the
 * returned `SpawnSyncResult` carries a proper `error` when the command does not exist.
 */
export function spawnSync(command: string, args: ReadonlyArray<string> = [], options: SpawnOptions = {}) {
	const parsed = parse(command, args, options);
	const result = cp.spawnSync(parsed.command, parsed.args, parsed.options);

	// Analyze if the command does not exist
	result.error = result.error ?? verifyENOENT(result.status, parsed, "spawnSync") ?? undefined;

	return result;
}

export const _parse = {
	parseNonShell,
	parse,
};
export const _enoent = {
	notFoundError,
	verifyENOENT,
	hookChildProcess,
};
export const _utils = {
	shebangCommand,
	readShebang,
	detectShebang,
	enterCwd,
	resolveCommand,
	resolveCommandAttempt,
	escapeLineBreaks,
	escapeMetaChars,
	escapeArgument,
	escapeCommand,
	pathKey,
};
