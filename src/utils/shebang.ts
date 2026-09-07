import fs from "node:fs";
import { type ParsedCommand, resolveCommand } from "./resolve-command";
import { shebangRegExp } from "./constants";

/**
 * Parses a shebang line into the interpreter command to run the script.
 * The interpreter path is reduced to its last segment (like `basename`, e.g. `/usr/bin/env` -> `env`).
 * Returns the bare binary, or `binary <argument>` when an argument is present.
 * The special case `env` returns only its argument (e.g. `/usr/bin/env node` -> `node`), because `env` would otherwise run with no program.
 *
 * @example
 * shebangCommand("#!/usr/bin/env node");
 * //=> "node"
 *
 * shebangCommand("#!/bin/bash -e");
 * //=> "bash -e"
 *
 * shebangCommand("not a shebang");
 * //=> null
 */
export function shebangCommand(string: string) {
	// Check for shebang
	const match = string.match(shebangRegExp);
	if (!match) return null;

	// Strip the leading `#!` (and any following whitespace), then split the
	// interpreter path from its optional argument.
	const [path, argument] = match[0].replace(/^#!\s*/, "").split(/\s+/);
	// Reduce the interpreter path to its last segment (e.g. `/usr/bin/env` -> `env`).
	const binary = path.split("/").pop() ?? "";

	return binary === "env" ? (argument ?? binary) : argument ? `${binary} ${argument}` : binary;
}

/**
 * Reads the shebang from a script file's contents.
 * Returns `null` if the file cannot be opened/read or if `shebangCommand` finds no shebang
 *
 * @example
 * readShebang("/usr/local/bin/script");
 * //=> "node"   (when the file starts with "#!/usr/bin/env node")
 * //=> null     (when the file has no shebang or cannot be read)
 */
export function readShebang(file: string) {
	// Read the first 150 bytes from the file
	const buffer = Buffer.alloc(150);
	try {
		const fd = fs.openSync(file, "r");
		fs.readSync(fd, buffer, 0, 150, 0);
		fs.closeSync(fd);
	} catch {
		return null;
	}

	// Extract shebang
	return shebangCommand(buffer.toString());
}

/**
 * Detects the shebang of the resolved `parsed.command` file and rewire
 * `parsed` to run the script through its interpreter. When the file has a shebang,
 * the script path is prepended to `parsed.args` and `parsed.command` becomes
 * the interpreter; the interpreter path is then resolved and returned.
 * Otherwise the resolved script path is returned, or `undefined` when the command could not be found.
 *
 * @example
 * detectShebang({ command: "my-script", args: [], file: undefined, ... });
 * // Rewired: command = "node", args = ["C:\\dir\\my-script"]
 * //=> "C:\\Program Files\\nodejs\\node.exe"
 */
export function detectShebang(parsed: ParsedCommand) {
	parsed.file = resolveCommand(parsed);

	if (parsed.file) {
		const shebang = readShebang(parsed.file);

		if (shebang) {
			parsed.args.unshift(parsed.file);
			parsed.command = shebang;

			return resolveCommand(parsed);
		}
	}

	return parsed.file;
}
