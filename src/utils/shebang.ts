import fs from "node:fs";
import { type ParsedCommand, resolveCommand } from "./resolve-command";
import { shebangRegExp } from "./variables";

export function shebangCommand(string: string) {
	// Check for shebang
	const match = string.match(shebangRegExp);
	if (!match) return null;

	// Strip the leading `#!` (and one optional space), then split the interpreter path from its optional argument.
	const [path, argument] = match[0].replace(/#! ?/, "").split(" ");
	// Reduce the interpreter path to its last segment (e.g. `/usr/bin/env` -> `env`).
	const binary = path.split("/").pop();

	return binary === "env" ? argument : argument ? `${binary} ${argument}` : binary;
}

export function readShebang(command: string) {
	// Read the first 150 bytes from the file
	const buffer = Buffer.alloc(150);
	try {
		const fd = fs.openSync(command, "r");
		fs.readSync(fd, buffer, 0, 150, 0);
		fs.closeSync(fd);
	} catch {
		return null;
	}

	// Extract shebang
	return shebangCommand(buffer.toString());
}

export function detectShebang(parsed: ParsedCommand) {
	parsed.file = resolveCommand(parsed);

	const shebang = parsed.file && readShebang(parsed.file);

	if (shebang) {
		parsed.args.unshift(parsed.file);
		parsed.command = shebang;

		return resolveCommand(parsed);
	}

	return parsed.file;
}
