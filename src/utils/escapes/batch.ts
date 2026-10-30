// To match batch files (after stripping trailing dots/spaces). CVE-2024-27980.
const batchFileRegExp = /\.(?:bat|cmd)$/i;

// Windows strips trailing dots and spaces from executable names before resolving
// them, so `.bat`/`.cmd` detection has to do the same. See CVE-2024-36138.
const trailingDotsSpacesRegExp = /[. ]+$/;

/**
 * Checks whether a command name refers to a Windows batch file. Trailing dots
 * and spaces are stripped first, because Windows resolves `tool.cmd.` and
 * `tool.cmd ` to `tool.cmd`. See CVE-2024-36138.
 *
 * @example
 * isBatchFile("C:\\bin\\tool.cmd");
 * //=> true
 * isBatchFile("tool.bat ");
 * //=> true
 * isBatchFile("tool.exe");
 * //=> false
 */
export function isBatchFile(name: string) {
	return batchFileRegExp.test(name.replace(trailingDotsSpacesRegExp, ""));
}

function unsafeBatchValueError(value: string, kind: "argument" | "command", reason: string) {
	return Object.assign(
		new TypeError(
			`Cannot safely pass the batch ${kind} ${JSON.stringify(value)} to cmd.exe: ${reason}. ` +
				"Batch files are parsed by cmd.exe, so this value could be used for command injection.",
		),
		{ code: "ERR_INVALID_ARG_VALUE" as const },
	);
}

// NUL and CR/LF terminate the cmd.exe command line.
const nullByteOrLineBreakRegExp = /[\0\r\n]/;

/**
 * Rejects batch command names that `cmd.exe` cannot receive safely: trailing
 * dots/spaces (Windows strips them, making the command ambiguous), `%` (expanded
 * before escaping), and NUL, CR, or LF.
 *
 * @throws {TypeError} With code `ERR_INVALID_ARG_VALUE` when the command is unsafe.
 */
export function assertSafeBatchCommand(command: string) {
	if (trailingDotsSpacesRegExp.test(command)) {
		throw unsafeBatchValueError(command, "command", "the executable name ends with a dot or a space");
	}

	if (command.includes("%")) {
		throw unsafeBatchValueError(command, "command", "it contains a percent sign, which cmd.exe expands and cannot escape reliably");
	}

	if (nullByteOrLineBreakRegExp.test(command)) {
		throw unsafeBatchValueError(command, "command", "it contains a null byte or a line break");
	}
}

/**
 * Escapes a single argument for a Windows batch file.
 *
 * Batch files are parsed by `cmd.exe` a second time, and caret escaping does not
 * survive nested batches. The argument is therefore always wrapped in double
 * quotes, with embedded quotes (`"` -> `""`) and backslashes before a quote or
 * the closing quote doubled.
 *
 * `%` is expanded before escaping and NUL/CR/LF terminate the command line, so
 * those values are rejected. This protects batch files that forward arguments
 * (`%*`); a file that strips quotes (`%~1`) and uses the value unquoted remains
 * unsafe.
 *
 * @throws {TypeError} With code `ERR_INVALID_ARG_VALUE` when the argument
 * contains `%`, NUL, `\r`, or `\n`.
 *
 * @example
 * escapeBatchArgument('a & b');
 * //=> '"a & b"'
 * escapeBatchArgument('say "hi"');
 * //=> '"say ""hi"""'
 */
export function escapeBatchArgument(arg: unknown) {
	const value = `${arg}`;

	if (value.includes("%")) {
		throw unsafeBatchValueError(value, "argument", "it contains a percent sign, which cmd.exe expands and cannot escape reliably");
	}

	if (nullByteOrLineBreakRegExp.test(value)) {
		throw unsafeBatchValueError(value, "argument", "it contains a null byte or a line break");
	}

	// A run of backslashes before a quote is doubled, and the quote itself is
	// doubled so it survives the batch file's own parsing. Because the argument
	// is always quoted, a run of backslashes at the very end must be doubled as
	// well; otherwise it would escape the closing quote.
	const escaped = value.replace(/(\\*)"/g, (_, backslashes: string) => `${backslashes}${backslashes}""`).replace(/(\\+)$/, "$1$1");

	return `"${escaped}"`;
}

// libuv's UV_EINVAL on Windows, which is what Node reports when a batch file is
// rejected by its CVE-2024-27980 mitigation.
const UV_EINVAL = -4071;

const batchFileRejection = Symbol("batchFileRejection");

interface BatchFileRejection {
	command: string;
	args: ReadonlyArray<string>;
}

export interface UnsafeBatchFileError extends Error {
	code: "EINVAL";
	errno: number;
	syscall: string;
	path?: string;
	spawnargs?: ReadonlyArray<string>;
	[batchFileRejection]: BatchFileRejection;
}

/**
 * Creates the error that mirrors Node's batch-file rejection.
 *
 * `spawn()` throws this synchronously as `spawn EINVAL`; `spawnSync()` exposes
 * the same failure through `result.error` as `spawnSync <file> EINVAL`.
 */
export function unsafeBatchFileError(command: string, syscall: "spawn" | "spawnSync" = "spawn", args: ReadonlyArray<string> = []) {
	const fullSyscall = syscall === "spawnSync" ? `spawnSync ${command}` : syscall;
	const error = Object.assign(new Error(`${fullSyscall} EINVAL`), {
		code: "EINVAL" as const,
		errno: UV_EINVAL,
		syscall: fullSyscall,
	}) as UnsafeBatchFileError;

	if (syscall === "spawnSync") {
		error.path = command;
		error.spawnargs = args.slice();
	}

	Object.defineProperty(error, batchFileRejection, {
		value: { command, args: args.slice() } satisfies BatchFileRejection,
	});

	return error;
}

/** Identifies the batch-file rejection thrown by {@link unsafeBatchFileError}. */
export function isUnsafeBatchFileError(error: unknown): error is UnsafeBatchFileError {
	return typeof error === "object" && error !== null && batchFileRejection in error;
}

/** Returns the batch command and args carried by a batch-file rejection. */
export function unsafeBatchFileErrorInfo(error: UnsafeBatchFileError) {
	return error[batchFileRejection];
}
