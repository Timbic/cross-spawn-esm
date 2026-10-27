import type { SpawnOptions as NodeSpawnOptions, SpawnSyncOptions as NodeSpawnSyncOptions } from "node:child_process";

/**
 * How Windows batch files (`.bat`/`.cmd`) are handled.
 *
 * - `"legacy"`: preserve the behavior of previous releases. Batch arguments use
 *   caret escaping and are not additionally restricted. This is the default for
 *   backwards compatibility, but it is not safe for untrusted input.
 * - `"strict"`: use quote-based batch escaping, reject `%`, NUL, CR, and LF,
 *   and force `cmd /d /e:on /v:off /s /c`. This protects batch files that
 *   forward arguments with `%*`; a batch file that strips quotes itself
 *   (`%~1`) remains inherently unsafe.
 * - `"reject"`: throw a `TypeError` before spawning any batch file.
 */
export type BatchMode = "legacy" | "strict" | "reject";

/**
 * Options shared by {@link spawn} and {@link spawnSync} in addition to the
 * options accepted by Node's `child_process` functions.
 */
export interface BatchOptions {
	/**
	 * Controls how Windows batch files (`.bat`/`.cmd`) are handled.
	 *
	 * Only applies on Windows and when `shell` is not enabled. With
	 * `shell: true`, Node's shell semantics apply and this package does not
	 * touch the command or its arguments.
	 *
	 * @default "legacy"
	 */
	batchMode?: BatchMode;
}

/**
 * Options for {@link spawn}. This is Node's `SpawnOptions` plus the
 * cross-spawn-specific options.
 */
export interface SpawnOptions extends NodeSpawnOptions, BatchOptions {}

/**
 * Options for {@link spawnSync}. This is Node's `SpawnSyncOptions` plus the
 * cross-spawn-specific options.
 */
export interface SpawnSyncOptions extends NodeSpawnSyncOptions, BatchOptions {}

/**
 * Internal/common shape used by the parser. Both {@link SpawnOptions} and
 * {@link SpawnSyncOptions} are assignable to it.
 */
export type CrossSpawnOptions = NodeSpawnOptions & NodeSpawnSyncOptions & BatchOptions;

/**
 * Options stored on a parsed command. `_forceShell` is an internal escape hatch
 * used by the test suite and by callers that need to force the Windows shell.
 */
export type ParseOptions = CrossSpawnOptions & { _forceShell?: boolean };

export interface ParsedCommand {
	command: string;
	args: Array<string>;
	options: ParseOptions;
	file?: string | null;
	original: { command: string; args: ReadonlyArray<string> };
}
