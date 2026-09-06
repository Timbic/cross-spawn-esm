import { metaCharsRegExp } from "./variables";

export function escapeCommand(arg: string) {
	return arg.replace(metaCharsRegExp, "^$1");
}

export function escapeArgument(arg: unknown, doubleEscapeMetaChars?: boolean) {
	// Convert to string
	let argStr = `${arg}`;

	// Algorithm below is based on https://qntm.org/cmd
	// It's slightly altered to disable JS backtracking to avoid hanging on specially crafted input
	// Please see https://github.com/moxystudio/node-cross-spawn/pull/160 for more information

	// Sequence of backslashes followed by a double quote:
	// double up all the backslashes and escape the double quote
	argStr = argStr.replace(/(?=(\\+?)?)\1"/g, '$1$1\\"');

	// Sequence of backslashes followed by the end of the string
	// (which will become a double quote later):
	// double up all the backslashes
	argStr = argStr.replace(/(?=(\\+?)?)\1$/, "$1$1");

	// All other backslashes occur literally

	// Quote the whole thing:
	argStr = `"${argStr}"`;

	// Escape meta chars
	argStr = argStr.replace(metaCharsRegExp, "^$1");

	// Double escape meta chars if necessary
	if (doubleEscapeMetaChars) {
		argStr = argStr.replace(metaCharsRegExp, "^$1");
	}

	return argStr;
}
