import { isWin } from "../utils/constants.ts";

// libuv's UV_EINVAL value on Windows.
export const UV_EINVAL = -4071;

// libuv's UV_ENOENT value for the current platform.
export const UV_ENOENT = isWin ? -4058 : -2;

/**
 * A Node-style error carrying an `errno`, a symbolic `code`, and the syscall
 * that failed. `path` and `spawnargs` are only present when the operation has
 * them, matching the shape produced by Node's `child_process` implementation.
 */
export interface ErrnoError<Code extends string = string> extends NodeJS.ErrnoException {
	code: Code;
	errno: number;
	syscall: string;
	path?: string;
	spawnargs?: ReadonlyArray<string>;
}

export interface ErrnoErrorOptions<Code extends string = string> {
	code: Code;
	errno: number;
	syscall: string;
	// Defaults to `${syscall} ${code}`, the format Node uses.
	message?: string;
	path?: string;
	spawnargs?: ReadonlyArray<string>;
}

/**
 * Low-level factory for Node-style `ErrnoException` objects.
 *
 * `path` and `spawnargs` are omitted when they are `undefined`, which is
 * important for matching Node: async `spawn()` EINVAL errors have neither,
 * while `spawnSync()` errors include both.
 */
export function createErrnoError<Code extends string>(options: ErrnoErrorOptions<Code>): ErrnoError<Code> {
	const { code, errno, syscall, message = `${syscall} ${code}`, path, spawnargs } = options;
	const error = Object.assign(new Error(message), {
		code,
		errno,
		syscall,
	}) as ErrnoError<Code>;

	if (path !== undefined) error.path = path;
	if (spawnargs !== undefined) error.spawnargs = spawnargs;

	return error;
}
