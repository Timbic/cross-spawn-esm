// Thank Windows for crlf
const lineBreaksRegExp = /[\r\n]+/g;

/**
 * Removes line breaks (`\r` and `\n`) from the given string.
 *
 * Without this, an argument containing a newline could terminate the enclosing
 * command early and inject an arbitrary second command into the shell. This is
 * used for non-batch `cmd.exe` escaping.
 *
 * @example
 * // Without escaping, cmd.exe would run two commands:
 * //   node -e "console.log('ok')
 * //   calc.exe"
 * escapeLineBreaks("console.log('ok')\ncalc.exe");
 * //=> "console.log('ok')calc.exe"
 */
export function escapeLineBreaks(arg: string) {
	return arg.replace(lineBreaksRegExp, "");
}

// See http://www.robvanderwoude.com/escapechars.php
const metaCharsRegExp = /([()\][%!^"`<>&|;, *?])/g;

/**
 * Prefixes every Windows `cmd.exe` meta character with`^`.
 * Without this, a meta character in a command or argument could be
 * interpreted by the shell, breaking the command or enabling arbitrary
 * command execution.
 *
 * This caret-based escaping is not safe for batch files: `%` is expanded before
 * caret escaping can take effect, and nested batch files consume carets. Use
 * `escapeBatchArgument()` with `batchMode: "strict"` for batch files.
 *
 * @example
 * // Without escaping, cmd.exe would treat the spaces and `&` as separators:
 * escapeMetaChars('notepad "a & b.txt"');
 * //=> 'notepad^ ^"a^ ^&^ b.txt^"'
 */
export function escapeMetaChars(arg: string) {
	return arg.replace(metaCharsRegExp, "^$1");
}

/**
 * Escapes a command name for a Windows `cmd.exe` invocation using caret-based
 * escaping: line breaks are removed, then meta characters are prefixed with `^`.
 *
 * The command must not contain whitespace. `cmd.exe` resolves the executable
 * before applying caret escapes, so a path containing spaces must be escaped as
 * a quoted argument with `escapeArgument()` instead.
 *
 * Caret escaping is not safe for batch files; use `escapeBatchArgument()` with
 * `batchMode: "strict"` for those.
 */
export function escapeCommand(arg: string) {
	return escapeMetaChars(escapeLineBreaks(arg));
}

/**
 * Escapes a single argument into a quoted token for a Windows `cmd.exe` command
 * line using caret-based escaping.
 *
 * Line breaks are removed, backslashes before a double quote and before the
 * closing quote are doubled, and meta characters are prefixed with `^`.
 *
 * @param arg Argument to escape. It is coerced to a string.
 * @param doubleEscapeMetaChars Escape meta characters a second time. This is
 * needed for cmd-shims in `node_modules/.bin`, where the value passes through
 * `cmd.exe` again.
 *
 * Caret escaping is not safe for batch files: `%` is expanded before caret
 * escaping can take effect, and nested batch files consume carets. Use
 * `escapeBatchArgument()` with `batchMode: "strict"` for those.
 */
export function escapeArgument(arg: unknown, doubleEscapeMetaChars?: boolean) {
	// Convert to string
	let argStr = `${arg}`;

	// Remove line breaks. `cmd.exe` treats `\r`/`\n` as command separators even
	// inside double quotes, so a user-controlled argument containing a newline
	// could otherwise inject an arbitrary command (command injection).
	argStr = escapeLineBreaks(argStr);

	// Sequence of backslashes followed by a double quote:
	// double up all the backslashes and escape the double quote
	argStr = argStr.replace(/(?=(\\+?)?)\1"/g, '$1$1\\"');

	// Sequence of backslashes followed by the end of the string
	// (which will become a double quote later):
	// double up all the backslashes
	argStr = argStr.replace(/(?=(\\+?)?)\1$/, "$1$1");

	// Quote the whole thing and escape meta chars
	argStr = escapeMetaChars(`"${argStr}"`);

	// Double escape meta chars if necessary
	if (doubleEscapeMetaChars) {
		argStr = escapeMetaChars(argStr);
	}

	return argStr;
}
