import fs from "node:fs";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { resolveCommand, resolveCommandAttempt } from "~/utils/resolve-command.ts";
import { isWin } from "~/utils/constants.ts";
import { createExecutable, createPlatformExecutable, makeTempDir, parsedCommand, removeDir, restoreEnv } from "./helpers";

describe("resolveCommand", () => {
	let root: string;
	let bin: string;
	let toolPath: string;

	beforeAll(() => {
		root = makeTempDir("cross-spawn-esm-resolve-");
		bin = path.join(root, "bin");
		toolPath = createPlatformExecutable(bin, "tool");
	});

	afterAll(() => removeDir(root));

	afterEach(() => vi.restoreAllMocks());

	test("should resolve a command found on the custom PATH", () => {
		expect(resolveCommand(parsedCommand("tool", { env: { PATH: bin } }))).toBe(toolPath);
	});

	test("should return the same result as resolveCommandAttempt when the first attempt matches", () => {
		const command = parsedCommand("tool", { env: { PATH: bin } });

		expect(resolveCommand(command)).toBe(resolveCommandAttempt(command));
	});

	test("should return `null` when the command is not found", () => {
		expect(resolveCommand(parsedCommand("no-such-tool", { env: { PATH: bin } }))).toBeNull();
	});

	test("should resolve an absolute command path without searching PATH", () => {
		expect(resolveCommand(parsedCommand(toolPath))).toBe(toolPath);
	});

	test("should resolve a relative command path against the custom cwd", () => {
		const cwd = path.join(root, "cwd");
		const script = createPlatformExecutable(cwd, "script");

		expect(resolveCommand(parsedCommand("./script", { cwd }))).toBe(script);
	});

	test("should resolve a relative command in Worker threads where `process.chdir` is unavailable", () => {
		const cwd = path.join(root, "worker-cwd");
		const script = createPlatformExecutable(cwd, "script");
		const chdir = vi.spyOn(process, "chdir").mockImplementation(() => {
			throw new Error("process.chdir is not available in Worker threads");
		});

		expect(resolveCommand(parsedCommand("./script", { cwd }))).toBe(script);
		expect(chdir).not.toHaveBeenCalled();
	});

	test("should resolve a real command from the process environment", () => {
		const result = resolveCommand(parsedCommand("node"));

		expect(result).toBeTypeOf("string");
		expect(path.isAbsolute(result!)).toBe(true);
		expect(fs.existsSync(result!)).toBe(true);
	});

	describe.runIf(isWin)("windows", () => {
		test("should read the PATH from a Windows `Path` environment key", () => {
			expect(resolveCommand(parsedCommand("tool", { env: { Path: bin } }))).toBe(toolPath);
		});

		describe("without PATHEXT extensions", () => {
			const originalPathExt = process.env.PATHEXT;
			let noExtDir: string;

			beforeAll(() => {
				process.env.PATHEXT = ".onlyexe";
				noExtDir = path.join(root, "noext");
				createExecutable(noExtDir, "say");
			});

			afterAll(() => {
				restoreEnv({ PATHEXT: originalPathExt });
			});

			test("should not match an extensionless file with the PATHEXT extensions", () => {
				expect(resolveCommandAttempt(parsedCommand("say", { env: { PATH: noExtDir } }))).toBeNull();
			});

			test("should retry the exact filename when the PATHEXT attempt fails", () => {
				expect(resolveCommand(parsedCommand("say", { env: { PATH: noExtDir } }))).toBe(path.join(noExtDir, "say"));
			});
		});
	});
});
