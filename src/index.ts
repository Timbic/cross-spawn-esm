import cp, { type SpawnOptions } from "node:child_process";
import { resolveCommand, resolveCommandAttempt, type ParsedCommand } from "./utils/resolve-command.ts";
import { notFoundError, verifyENOENT, hookChildProcess } from "./enoent.ts";
import { shebangCommand, readShebang, detectShebang } from "./utils/shebang.ts";
import { escapeLineBreaks, escapeMetaChars, escapeArgument, escapeCommand } from "./utils/escapes.ts";
import { pathKey, type PathKeyOptions } from "./utils/path-key.ts";
import { parseNonShell, parse } from "./parse.ts";

export type { ParsedCommand, PathKeyOptions };

/**
 * The `spawn()` function spawns a new process using the given `command`, with
 * command line arguments in `args`. If omitted, `args` defaults to an empty array.
 */
export function spawn(command: string, args: ReadonlyArray<string> = [], options: SpawnOptions = {}) {
	// Parse the arguments
	const parsed = parse(command, args, options);

	// Spawn the child process
	const spawned = cp.spawn(parsed.command, parsed.args, parsed.options);

	// Hook into child process "exit" event to emit an error if the command
	// does not exists, see: https://github.com/IndigoUnited/node-cross-spawn/issues/16
	hookChildProcess(spawned, parsed);

	return spawned;
}

/**
 * The `spawnSync()` function spawns a new process using the given `command`, with
 * command line arguments in `args`. If omitted, `args` defaults to an empty array.
 */
export function spawnSync(command: string, args: ReadonlyArray<string> = [], options: SpawnOptions = {}) {
	// Parse the arguments
	const parsed = parse(command, args, options);

	// Spawn the child process
	const result = cp.spawnSync(parsed.command, parsed.args, parsed.options);

	// Analyze if the command does not exist, see: https://github.com/IndigoUnited/node-cross-spawn/issues/16
	result.error = result.error || verifyENOENT(result.status, parsed, "spawnSync") || undefined;

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
	resolveCommand,
	resolveCommandAttempt,
	escapeLineBreaks,
	escapeMetaChars,
	escapeArgument,
	escapeCommand,
	pathKey,
};
