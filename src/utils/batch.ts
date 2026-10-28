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

/**
 * Rejects batch command names that `cmd.exe` cannot receive safely.
 *
 * The executable name is parsed by `cmd.exe` as well, so it is subject to the
 * same restrictions as batch arguments. A trailing dot or space is rejected
 * because Windows silently strips it, which would make the batch detection and
 * the actual execution disagree about the file being run.
 */
export function assertSafeBatchCommand(command: string) {
	if (trailingDotsSpacesRegExp.test(command)) {
		throw unsafeBatchValueError(command, "command", "the executable name ends with a dot or a space");
	}

	if (command.includes("%")) {
		throw unsafeBatchValueError(command, "command", "it contains a percent sign, which cmd.exe expands and cannot escape reliably");
	}

	if (/[\0\r\n]/.test(command)) {
		throw unsafeBatchValueError(command, "command", "it contains a null byte or a line break");
	}
}

/**
 * Escapes a single argument for a Windows batch file.
 *
 * Batch files are parsed by `cmd.exe` a second time, so caret-based escaping
 * (`^`) is not stable: each nested batch file can expand the argument again.
 * Quotes, on the other hand, expand to themselves, so the argument is always
 * wrapped in double quotes, embedded quotes are doubled (`"` -> `""`), and
 * backslashes are doubled when they precede a quote or the closing quote.
 *
 * `%` is expanded by `cmd.exe` before any escaping can take effect and cannot
 * be escaped reliably (especially across nested batch files), so values
 * containing it are rejected instead of being silently mangled or injected.
 * NUL and line breaks are rejected for the same reason: they terminate the
 * command line.
 *
 * This protects batch files that forward their arguments (`%*`). A batch file
 * that strips the quotes itself (`%~1`) and then uses the value unquoted can
 * still be injected; no caller-side escaping can prevent that.
 *
 * @throws {TypeError} When the argument contains `%`, NUL, `\r`, or `\n`.
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

	if (/[\0\r\n]/.test(value)) {
		throw unsafeBatchValueError(value, "argument", "it contains a null byte or a line break");
	}

	// A run of backslashes before a quote is doubled, and the quote itself is
	// doubled so it survives the batch file's own parsing. Because the argument
	// is always quoted, a run of backslashes at the very end must be doubled as
	// well; otherwise it would escape the closing quote.
	const escaped = value.replace(/(\\*)"/g, (_, backslashes: string) => `${backslashes}${backslashes}""`).replace(/(\\+)$/, "$1$1");

	return `"${escaped}"`;
}

/**
 * Error thrown when `batchMode: "reject"` is used and the command resolves to
 * a Windows batch file.
 */
export function unsafeBatchFileError(command: string) {
	return Object.assign(
		new TypeError(
			`Refusing to execute the Windows batch file ${JSON.stringify(command)} because batchMode is "reject". ` +
				'Use batchMode: "strict" if you need to execute batch files with escaped arguments.',
		),
		{ code: "ERR_UNSAFE_BATCH_FILE" as const },
	);
}
