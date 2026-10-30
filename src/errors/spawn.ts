import { createErrnoError, UV_ENOENT, type ErrnoError } from "./errno.ts";

/** Error shape shared by the spawn-related failures this package fabricates. */
export type SpawnError = ErrnoError;

/**
 * Builds the ENOENT error Node would produce when it cannot locate a command.
 *
 * The `syscall` includes the command name, as Node does for both `spawn` and
 * `spawnSync` (`spawn <command>` / `spawnSync <command>`).
 */
export function createSpawnEnoentError(
	original: { command: string; args: ReadonlyArray<string> },
	syscall: "spawn" | "spawnSync",
): ErrnoError<"ENOENT"> {
	return createErrnoError({
		code: "ENOENT",
		errno: UV_ENOENT,
		syscall: `${syscall} ${original.command}`,
		path: original.command,
		spawnargs: original.args,
	});
}
