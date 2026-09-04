import cp, { type SpawnOptions } from "node:child_process";
import utils from "./utils.ts";
import parse from "./parse.ts";
import enoent from "./enoent.ts";

/**
 * The `spawn()` function spawns a new process using the given `command`, with
 * command line arguments in `args`. If omitted, `args` defaults to an empty array.
 */
function spawn(command: string, args: ReadonlyArray<string> = [], options: SpawnOptions = {}) {
	// Parse the arguments
	const parsed = parse(command, args, options);

	// Spawn the child process
	const spawned = cp.spawn(parsed.command, parsed.args, parsed.options);

	// Hook into child process "exit" event to emit an error if the command
	// does not exists, see: https://github.com/IndigoUnited/node-cross-spawn/issues/16
	enoent.hookChildProcess(spawned, parsed);

	return spawned;
}

/**
 * The `spawnSync()` function spawns a new process using the given `command`, with
 * command line arguments in `args`. If omitted, `args` defaults to an empty array.
 */
function spawnSync(command: string, args: ReadonlyArray<string> = [], options: SpawnOptions = {}) {
	// Parse the arguments
	const parsed = parse(command, args, options);

	// Spawn the child process
	const result = cp.spawnSync(parsed.command, parsed.args, parsed.options);

	// Analyze if the command does not exist, see: https://github.com/IndigoUnited/node-cross-spawn/issues/16
	result.error = result.error || enoent.verifyENOENT(result.status, parsed, "spawnSync") || undefined;

	return result;
}

export { spawn, spawnSync, parse as _parse, enoent as _enoent, utils as _utils };
