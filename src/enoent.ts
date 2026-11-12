import type cp from "node:child_process";
import type { ParsedCommand } from "~/types/index.ts";
import { createSpawnEnoentError, type SpawnError } from "~/errors/index.ts";
import { isWin } from "~/utils/constants.ts";

/**
 * Builds an ENOENT error for a command that could not be found. Creates
 * an error whose shape matches what Node's own `spawn`/`spawnSync` would produce
 * when it fails to locate the command file. This makes the error interchangeable
 * with a real ENOENT from Node.
 */
export function notFoundError(original: ParsedCommand["original"], syscall: "spawn" | "spawnSync"): SpawnError {
	return createSpawnEnoentError(original, syscall);
}

/**
 * Detects the Windows-only fake ENOENT that `cmd.exe` produces. On POSIX or
 * for any other exit code the error is not applicable, so `null` is returned.
 *
 * The check is skipped when `options.shell` is set. In that case the shell
 * resolves the command itself, so exit status `1` cannot be distinguished from
 * a command that exists and genuinely exited with `1`. Node reports the status
 * unchanged, and so do we.
 */
export function verifyENOENT(status: number | null, parsed: ParsedCommand, syscall: "spawn" | "spawnSync") {
	if (isWin && status === 1 && !parsed.file && !parsed.options.shell) {
		return notFoundError(parsed.original, syscall);
	}

	return null;
}

/**
 * Hooks into a `ChildProcess` `exit` event so that a missing command is
 * surfaced as an `error` event instead of silently exiting with code `1`.
 *
 * On POSIX, a missing command already produces a real ENOENT from libuv and
 * this hook is not needed. On Windows, the command is typically wrapped by
 * `cmd.exe`, which reports an unrecognized command as exit status `1`. This
 * monkey-patches `cp.emit` to intercept that case and emit an `error` event
 * with the proper ENOENT, so Node-style error handling works unchanged.
 */
export function hookChildProcess(cp: cp.ChildProcess, parsed: ParsedCommand) {
	if (!isWin) return;

	const originalEmit = cp.emit;
	cp.emit = function (name: string | symbol, ...args: unknown[]) {
		if (name === "exit") {
			const status = args[0] as number | null;
			const err = verifyENOENT(status, parsed, "spawn");
			if (err) return originalEmit.call(cp, "error", err);
		}

		return originalEmit.apply(cp, [name, ...args]);
	};
}

export type { SpawnError };
