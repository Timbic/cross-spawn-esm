import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ParsedCommand, SpawnOptions } from "~/utils/types";
import { isWin } from "~/utils/constants";

export function createExecutable(dir: string, name: string) {
	const target = path.join(dir, name);
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(target, "");
	if (!isWin) fs.chmodSync(target, 0o755);
	return target;
}

export function createPlatformExecutable(dir: string, name: string) {
	return createExecutable(dir, isWin ? `${name}.EXE` : name);
}

export function parsedCommand(command: string, options: SpawnOptions = {}): ParsedCommand {
	return { command, args: [], options, original: { command, args: [] } };
}

export function joinWithDelimiter(...entries: Array<string>) {
	return entries.join(path.delimiter);
}

export function makeTempDir(prefix: string) {
	return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function removeDir(dir: string) {
	fs.rmSync(dir, { recursive: true, force: true });
}

export function restoreEnv(defaults: Record<string, string | undefined>) {
	for (const key of Object.keys(defaults)) {
		const value = defaults[key];
		if (value === undefined) Reflect.deleteProperty(process.env, key);
		else process.env[key] = value;
	}
}

export function captureError(fn: () => unknown) {
	try {
		fn();
	} catch (error) {
		return error;
	}

	throw new Error("Expected function to throw");
}
