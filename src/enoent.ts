import type { ChildProcess } from "node:child_process";
import type { ParsedCommand } from "./utils/resolve-command";
import { isWin } from "./utils/variables";

export function notFoundError(original: ParsedCommand["original"], syscall: "spawn" | "spawnSync") {
	return Object.assign(new Error(`${syscall} ${original.command} ENOENT`), {
		code: "ENOENT",
		errno: "ENOENT",
		syscall: `${syscall} ${original.command}`,
		path: original.command,
		spawnargs: original.args,
	});
}

export function verifyENOENT(status: number | null, parsed: ParsedCommand, syscall: "spawn" | "spawnSync") {
	if (isWin && status === 1 && !parsed.file) {
		return notFoundError(parsed.original, syscall);
	}

	return null;
}

export function hookChildProcess(cp: ChildProcess, parsed: ParsedCommand) {
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
