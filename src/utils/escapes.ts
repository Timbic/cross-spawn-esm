import { lineBreaksRegExp, metaCharsRegExp } from "./constants";

/**
 * Remove line breaks (`\r` and `\n`) from the given string. Without this, an argument containing a newline could terminate the enclosing
 * command early and inject an arbitrary second command into the shell.
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

/**
 * Escape Windows `cmd.exe` shell meta characters (``/([()\][%!^"`<>&|;, *?])/g``) by prefixing each with `^`. Without this, a meta character in a command or argument would be interpreted
 * by the shell, breaking the command or enabling arbitrary command execution.
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
 * Escapes a command name for safe use in a Windows `cmd.exe` invocation.
 */
export function escapeCommand(arg: string) {
	return escapeMetaChars(escapeLineBreaks(arg));
}

/**
 * Escape a single argument into a fully self-contained token for a Windows
 * `cmd.exe` command line.
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
