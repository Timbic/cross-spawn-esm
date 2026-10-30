import type { SpawnOptions as NodeSpawnOptions, SpawnSyncOptions as NodeSpawnSyncOptions } from "node:child_process";

/**
 * How Windows batch files (`.bat`/`.cmd`) are handled.
 *
 * - `"legacy"` (default): previous caret-based behavior; not safe for untrusted input.
 * - `"strict"`: quote-based escaping with `cmd /d /e:on /v:off /s /c`; rejects
 *   `%`, NUL, CR, and LF. Protects `%*`, but not `%~1`.
 * - `"reject"`: mirror Node's behavior: `spawn` throws an
 *   `EINVAL` error and `spawnSync` returns it in `result.error`.
 */
export type BatchMode = "legacy" | "strict" | "reject";

/**
 * Options shared by {@link spawn} and {@link spawnSync} in addition to Node's
 * `child_process` options.
 */
export interface BatchOptions {
	/**
	 * Controls how Windows batch files (`.bat`/`.cmd`) are handled. Only applies on
	 * Windows with `shell` disabled; with `shell: true`, Node's semantics apply.
	 * `"reject"` matches Node's `EINVAL` rejection behavior.
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
export type ParseOptions = CrossSpawnOptions & {
	/** Internal test-only escape hatch that forces the Windows shell. */
	_forceShell?: boolean;
};

export interface ParsedCommand {
	command: string;
	args: Array<string>;
	options: ParseOptions;
	file?: string | null;
	original: { command: string; args: ReadonlyArray<string> };
}
