import type cp from "node:child_process";
import type { BatchOptions } from "./batch.ts";

/**
 * Options for {@link spawn}. This is Node's `SpawnOptions` plus the
 * cross-spawn-specific options.
 */
export interface SpawnOptions extends cp.SpawnOptions, BatchOptions {}

/**
 * Options for {@link spawnSync}. This is Node's `SpawnSyncOptions` plus the
 * cross-spawn-specific options.
 */
export interface SpawnSyncOptions extends cp.SpawnSyncOptions, BatchOptions {}

export interface ParsedCommand {
	command: string;
	args: Array<string>;
	options: SpawnOptions & {
		/** Internal test-only escape hatch that forces the Windows shell. */
		_forceShell?: boolean;
	};
	file?: string | null;
	original: { command: string; args: ReadonlyArray<string> };
}

export type { BatchOptions, BatchMode } from "./batch.ts";
