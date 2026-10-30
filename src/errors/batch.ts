import { createErrnoError, UV_EINVAL, type ErrnoError } from "./errno.ts";

const batchFileRejection = Symbol("batchFileRejection");

interface BatchFileRejection {
	command: string;
	args: ReadonlyArray<string>;
}

export interface BatchFileError extends ErrnoError<"EINVAL"> {
	[batchFileRejection]: BatchFileRejection;
}

/**
 * Builds the error Node produces when its CVE-2024-27980 mitigation rejects a
 * Windows batch file.
 *
 * Async `spawn()` throws this synchronously as `spawn EINVAL`, with no `path`
 * or `spawnargs`. `spawnSync()` receives the same error through `result.error`
 * as `spawnSync <file> EINVAL`, including both properties.
 */
export function createBatchFileError(
	command: string,
	syscall: "spawn" | "spawnSync" = "spawn",
	args: ReadonlyArray<string> = [],
): BatchFileError {
	const isSync = syscall === "spawnSync";
	const error = createErrnoError({
		code: "EINVAL",
		errno: UV_EINVAL,
		syscall: isSync ? `spawnSync ${command}` : syscall,
		path: isSync ? command : undefined,
		spawnargs: isSync ? args.slice() : undefined,
	}) as BatchFileError;

	Object.defineProperty(error, batchFileRejection, {
		value: { command, args: args.slice() } satisfies BatchFileRejection,
	});

	return error;
}

/** Identifies a batch-file rejection created by {@link createBatchFileError}. */
export function isBatchFileError(error: unknown): error is BatchFileError {
	return typeof error === "object" && error !== null && batchFileRejection in error;
}

/** Returns the batch command and args carried by a batch-file rejection. */
export function batchFileErrorInfo(error: BatchFileError) {
	return error[batchFileRejection];
}

/**
 * Builds the `ERR_INVALID_ARG_VALUE` TypeError used when a batch command or
 * argument cannot be passed safely to `cmd.exe`.
 */
export function createBatchValueError(value: string, kind: "argument" | "command", reason: string) {
	return Object.assign(
		new TypeError(
			`Cannot safely pass the batch ${kind} ${JSON.stringify(value)} to cmd.exe: ${reason}. ` +
				"Batch files are parsed by cmd.exe, so this value could be used for command injection.",
		),
		{ code: "ERR_INVALID_ARG_VALUE" as const },
	);
}
