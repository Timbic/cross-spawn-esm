import fs from "node:fs";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import { whichSync } from "~/utils/which.ts";
import { isWin } from "~/utils/constants.ts";
import { createExecutable, createPlatformExecutable, joinWithDelimiter, makeTempDir, removeDir, restoreEnv } from "./helpers";

describe("whichSync", () => {
	let root: string;

	const originalEnv = { PATH: process.env.PATH, PATHEXT: process.env.PATHEXT };

	function inRoot(...segments: Array<string>) {
		return path.join(root, ...segments);
	}

	beforeAll(() => {
		root = makeTempDir("cross-spawn-esm-which-");
	});

	afterAll(() => removeDir(root));

	afterEach(() => restoreEnv(originalEnv));

	test("should return `null` if the command is not found", () => {
		expect(whichSync("missing", { cwd: root, path: root })).toBeNull();
	});

	test("should strip surrounding quotes from a PATH entry", () => {
		const bin = inRoot("quoted-bin");
		const target = createPlatformExecutable(bin, "tool");

		expect(whichSync("tool", { cwd: root, path: `"${bin}"`, pathExt: ".EXE" })).toBe(target);
	});

	test("should return an absolute path", () => {
		const bin = inRoot("abs-bin");
		const target = createPlatformExecutable(bin, "tool");

		const result = whichSync("tool", { cwd: root, path: bin, pathExt: ".EXE" });

		expect(result).toBe(target);
		expect(path.isAbsolute(result!)).toBe(true);
	});

	test("should resolve a command with a leading ./", () => {
		const cwd = inRoot("dot-cwd");
		const target = createPlatformExecutable(cwd, "tool");

		expect(whichSync(`.${path.sep}tool`, { cwd, pathExt: ".EXE" })).toBe(target);
	});

	test("should resolve a command with a leading ../", () => {
		const cwd = inRoot("dotdot-cwd", "inner");
		fs.mkdirSync(cwd, { recursive: true });
		const target = createPlatformExecutable(inRoot("dotdot-cwd"), "tool");

		expect(whichSync(`..${path.sep}tool`, { cwd, pathExt: ".EXE" })).toBe(target);
	});

	test("should fall back to the process environment and working directory", () => {
		const result = whichSync("node");

		expect(result).not.toBeNull();
		expect(path.isAbsolute(result!)).toBe(true);
	});

	test("should default the search path to `process.env.PATH`", () => {
		const bin = inRoot("env-path-bin");
		const target = createPlatformExecutable(bin, "tool");
		process.env.PATH = bin;

		expect(whichSync("tool", { cwd: root, pathExt: ".EXE" })).toBe(target);
	});

	describe.runIf(isWin)("windows", () => {
		test("should search the current directory first", () => {
			const cwd = inRoot("win-cwd");
			const target = createPlatformExecutable(cwd, "tool");

			expect(whichSync("tool", { cwd, path: "", pathExt: ".EXE" })).toBe(target);
		});

		test("should search PATH entries in order", () => {
			const first = inRoot("win-order-first");
			const second = inRoot("win-order-second");
			const target = createPlatformExecutable(first, "tool");
			createPlatformExecutable(second, "tool");

			expect(whichSync("tool", { cwd: root, path: joinWithDelimiter(first, second), pathExt: ".EXE" })).toBe(target);
		});

		test("should try the bare command before appending an extension", () => {
			const bin = inRoot("win-bare");
			const target = createExecutable(bin, "script.cmd");

			expect(whichSync("script.cmd", { cwd: root, path: bin, pathExt: ".CMD" })).toBe(target);
		});

		test("should try each pathExt extension", () => {
			const bin = inRoot("win-multi-ext");
			const target = createExecutable(bin, "tool.COM");

			expect(whichSync("tool", { cwd: root, path: bin, pathExt: joinWithDelimiter(".EXE", ".COM") })).toBe(target);
		});

		test("should return `null` if the command extension is not in pathExt", () => {
			const bin = inRoot("win-other-ext");
			createExecutable(bin, "tool.txt");

			expect(whichSync("tool.txt", { cwd: root, path: bin, pathExt: ".EXE" })).toBeNull();
		});

		test("should default pathExt to `process.env.PATHEXT`", () => {
			const bin = inRoot("win-env-pathext");
			const target = createExecutable(bin, "tool.sh");
			process.env.PATHEXT = ".sh";

			expect(whichSync("tool", { cwd: root, path: bin })).toBe(target);
		});

		test("should fall back to the default pathExt when it is empty", () => {
			const bin = inRoot("win-empty-pathext");
			const target = createPlatformExecutable(bin, "tool");

			expect(whichSync("tool", { cwd: root, path: bin, pathExt: "" })).toBe(target);
		});

		test("should resolve a command containing a path separator directly", () => {
			const target = createPlatformExecutable(inRoot("win-rel"), "tool");

			expect(whichSync(path.join("win-rel", "tool"), { cwd: root, path: inRoot("win-other"), pathExt: ".EXE" })).toBe(target);
		});
	});

	describe.runIf(!isWin)("linux", () => {
		test("should find an executable in a PATH entry", () => {
			const bin = inRoot("linux-bin");
			const target = createPlatformExecutable(bin, "tool");

			expect(whichSync("tool", { cwd: root, path: bin })).toBe(target);
		});

		test("should not match a non-executable file", () => {
			const bin = inRoot("linux-noexec");
			fs.mkdirSync(bin, { recursive: true });
			const target = path.join(bin, "tool");
			fs.writeFileSync(target, "");
			fs.chmodSync(target, 0o644);

			expect(whichSync("tool", { cwd: root, path: bin })).toBeNull();
		});

		test("should search PATH entries in order", () => {
			const first = inRoot("linux-order-first");
			const second = inRoot("linux-order-second");
			const target = createPlatformExecutable(first, "tool");
			createPlatformExecutable(second, "tool");

			expect(whichSync("tool", { cwd: root, path: joinWithDelimiter(first, second) })).toBe(target);
		});

		test("should not search the current directory", () => {
			const cwd = inRoot("linux-cwd");
			createPlatformExecutable(cwd, "tool");

			expect(whichSync("tool", { cwd, path: inRoot("linux-empty") })).toBeNull();
		});

		test("should search the current directory for an empty PATH entry", () => {
			const cwd = inRoot("linux-empty-path");
			const target = createPlatformExecutable(cwd, "tool");

			expect(whichSync("tool", { cwd, path: "" })).toBe(target);
		});

		test("should ignore pathExt", () => {
			const bin = inRoot("linux-ignore-pathext");
			createExecutable(bin, "tool.EXE");

			expect(whichSync("tool", { cwd: root, path: bin, pathExt: ".EXE" })).toBeNull();
		});

		test("should return `null` for a non-executable path command", () => {
			const dir = inRoot("linux-noexec-path");
			fs.mkdirSync(dir, { recursive: true });
			const target = path.join(dir, "tool");
			fs.writeFileSync(target, "");
			fs.chmodSync(target, 0o644);

			expect(whichSync(target, { cwd: root })).toBeNull();
		});

		test("should resolve a command containing a path separator directly", () => {
			const target = createPlatformExecutable(inRoot("linux-rel"), "tool");

			expect(whichSync(path.join("linux-rel", "tool"), { cwd: root, path: inRoot("linux-other") })).toBe(target);
		});

		test("should return `null` for a missing command containing a path separator", () => {
			expect(whichSync(path.join("linux-rel", "missing"), { cwd: root, path: inRoot("linux-other") })).toBeNull();
		});
	});
});
