import type { NonSharedBuffer } from "node:buffer";
import cp from "node:child_process";
import type {
	BatchMode,
	BatchOptions,
	CrossSpawnOptions,
	ParsedCommand,
	ParseOptions,
	SpawnOptions,
	SpawnSyncOptions,
} from "./utils/types.ts";
import { assertSafeBatchCommand, escapeBatchArgument, isBatchFile, unsafeBatchFileError } from "./utils/escapes/batch.ts";
import { escapeArgument, escapeCommand, escapeLineBreaks, escapeMetaChars } from "./utils/escapes/index.ts";
import { notFoundError, verifyENOENT, hookChildProcess, type SpawnError } from "./enoent.ts";
import { resolveCommand, resolveCommandAttempt } from "./utils/resolve-command.ts";
import { shebangCommand, readShebang, detectShebang } from "./utils/shebang.ts";
import { pathKey, type PathKeyOptions } from "./utils/path-key.ts";
import { parseNonShell, parse } from "./parse.ts";

export type { BatchMode, BatchOptions, CrossSpawnOptions, ParsedCommand, SpawnOptions, SpawnSyncOptions, SpawnError, PathKeyOptions };

function toNodeOptions(options: ParseOptions) {
	const { batchMode, _forceShell, ...nodeOptions } = options;
	return nodeOptions;
}

/**
 * A cross-platform drop-in replacement for `child_process.spawn()`.
 *
 * On POSIX, arguments are forwarded to the native `spawn` unchanged. On
 * Windows the command and its arguments are rewritten so that the correct
 * interpreter is invoked for shebang scripts and special characters and
 * whitespace in arguments are escaped for `cmd.exe` according to `batchMode`.
 * A missing command (which `cmd.exe` signals with exit status `1` instead of a
 * real `ENOENT`) is surfaced as an `error` event, matching what Node produces
 * on POSIX.
 */
export function spawn(command: string, options?: SpawnOptions): cp.ChildProcess;
export function spawn(command: string, args?: ReadonlyArray<string>, options?: SpawnOptions): cp.ChildProcess;
export function spawn(command: string, args: ReadonlyArray<string> | SpawnOptions = [], options: SpawnOptions = {}) {
	const parsed = parse(command, args, options);
	const spawned = cp.spawn(parsed.command, parsed.args, toNodeOptions(parsed.options));

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
export function spawnSync(command: string, options?: SpawnSyncOptions): cp.SpawnSyncReturns<string | NonSharedBuffer>;
export function spawnSync(
	command: string,
	args?: ReadonlyArray<string>,
	options?: SpawnSyncOptions,
): cp.SpawnSyncReturns<string | NonSharedBuffer>;
export function spawnSync(command: string, args: ReadonlyArray<string> | SpawnSyncOptions = [], options: SpawnSyncOptions = {}) {
	const parsed = parse(command, args, options);
	const result = cp.spawnSync(parsed.command, parsed.args, toNodeOptions(parsed.options));

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
	resolveCommand,
	resolveCommandAttempt,
	escapeLineBreaks,
	escapeMetaChars,
	escapeArgument,
	escapeCommand,
	escapeBatchArgument,
	assertSafeBatchCommand,
	isBatchFile,
	unsafeBatchFileError,
	pathKey,
};
