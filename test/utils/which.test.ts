import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import { whichSync } from "~/utils/which.ts";
import { isWin } from "~/utils/constants.ts";

function pathList(...entries: Array<string>) {
	return entries.join(path.delimiter);
}

describe("whichSync", () => {
	let root: string;

	const originalEnv = { PATH: process.env.PATH, PATHEXT: process.env.PATHEXT };

	function abs(...segments: Array<string>) {
		return path.join(root, ...segments);
	}

	function create(dir: string, name: string) {
		const target = path.join(dir, name);
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(target, "");
		if (!isWin) fs.chmodSync(target, 0o755);
		return target;
	}

	function exe(dir: string, name: string) {
		return create(dir, isWin ? `${name}.EXE` : name);
	}

	beforeAll(() => {
		root = fs.mkdtempSync(path.join(os.tmpdir(), "cross-spawn-esm-which-"));
	});

	afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

	afterEach(() => {
		if (originalEnv.PATH === undefined) delete process.env.PATH;
		else process.env.PATH = originalEnv.PATH;

		if (originalEnv.PATHEXT === undefined) delete process.env.PATHEXT;
		else process.env.PATHEXT = originalEnv.PATHEXT;
	});

	test("should return `null` if the command is not found", () => {
		expect(whichSync("missing", { cwd: root, path: root })).toBeNull();
	});

	test("should strip surrounding quotes from a PATH entry", () => {
		const bin = abs("quoted-bin");
		const target = exe(bin, "tool");

		expect(whichSync("tool", { cwd: root, path: `"${bin}"`, pathExt: ".EXE" })).toBe(target);
	});

	test("should return an absolute path", () => {
		const bin = abs("abs-bin");
		const target = exe(bin, "tool");

		const result = whichSync("tool", { cwd: root, path: bin, pathExt: ".EXE" });

		expect(result).toBe(target);
		expect(path.isAbsolute(result!)).toBe(true);
	});

	test("should resolve a command with a leading ./", () => {
		const cwd = abs("dot-cwd");
		const target = exe(cwd, "tool");

		expect(whichSync(`.${path.sep}tool`, { cwd, pathExt: ".EXE" })).toBe(target);
	});

	test("should resolve a command with a leading ../", () => {
		const cwd = abs("dotdot-cwd", "inner");
		fs.mkdirSync(cwd, { recursive: true });
		const target = exe(abs("dotdot-cwd"), "tool");

		expect(whichSync(`..${path.sep}tool`, { cwd, pathExt: ".EXE" })).toBe(target);
	});

	test("should fall back to the process environment and working directory", () => {
		const result = whichSync("node");

		expect(result).not.toBeNull();
		expect(path.isAbsolute(result!)).toBe(true);
	});

	test("should default the search path to `process.env.PATH`", () => {
		const bin = abs("env-path-bin");
		const target = exe(bin, "tool");
		process.env.PATH = bin;

		expect(whichSync("tool", { cwd: root, pathExt: ".EXE" })).toBe(target);
	});

	describe.runIf(isWin)("windows", () => {
		test("should search the current directory first", () => {
			const cwd = abs("win-cwd");
			const target = exe(cwd, "tool");

			expect(whichSync("tool", { cwd, path: "", pathExt: ".EXE" })).toBe(target);
		});

		test("should search PATH entries in order", () => {
			const first = abs("win-order-first");
			const second = abs("win-order-second");
			const target = exe(first, "tool");
			exe(second, "tool");

			expect(whichSync("tool", { cwd: root, path: pathList(first, second), pathExt: ".EXE" })).toBe(target);
		});

		test("should try the bare command before appending an extension", () => {
			const bin = abs("win-bare");
			const target = create(bin, "script.cmd");

			expect(whichSync("script.cmd", { cwd: root, path: bin, pathExt: ".CMD" })).toBe(target);
		});

		test("should try each pathExt extension", () => {
			const bin = abs("win-multi-ext");
			const target = create(bin, "tool.COM");

			expect(whichSync("tool", { cwd: root, path: bin, pathExt: pathList(".EXE", ".COM") })).toBe(target);
		});

		test("should return `null` if the command extension is not in pathExt", () => {
			const bin = abs("win-other-ext");
			create(bin, "tool.txt");

			expect(whichSync("tool.txt", { cwd: root, path: bin, pathExt: ".EXE" })).toBeNull();
		});

		test("should default pathExt to `process.env.PATHEXT`", () => {
			const bin = abs("win-env-pathext");
			const target = create(bin, "tool.sh");
			process.env.PATHEXT = ".sh";

			expect(whichSync("tool", { cwd: root, path: bin })).toBe(target);
		});

		test("should fall back to the default pathExt when it is empty", () => {
			const bin = abs("win-empty-pathext");
			const target = exe(bin, "tool");

			expect(whichSync("tool", { cwd: root, path: bin, pathExt: "" })).toBe(target);
		});

		test("should resolve a command containing a path separator directly", () => {
			const target = exe(abs("win-rel"), "tool");

			expect(whichSync(path.join("win-rel", "tool"), { cwd: root, path: abs("win-other"), pathExt: ".EXE" })).toBe(target);
		});
	});

	describe.runIf(!isWin)("linux", () => {
		test("should find an executable in a PATH entry", () => {
			const bin = abs("linux-bin");
			const target = exe(bin, "tool");

			expect(whichSync("tool", { cwd: root, path: bin })).toBe(target);
		});

		test("should not match a non-executable file", () => {
			const bin = abs("linux-noexec");
			fs.mkdirSync(bin, { recursive: true });
			const target = path.join(bin, "tool");
			fs.writeFileSync(target, "");
			fs.chmodSync(target, 0o644);

			expect(whichSync("tool", { cwd: root, path: bin })).toBeNull();
		});

		test("should search PATH entries in order", () => {
			const first = abs("linux-order-first");
			const second = abs("linux-order-second");
			const target = exe(first, "tool");
			exe(second, "tool");

			expect(whichSync("tool", { cwd: root, path: pathList(first, second) })).toBe(target);
		});

		test("should not search the current directory", () => {
			const cwd = abs("linux-cwd");
			exe(cwd, "tool");

			expect(whichSync("tool", { cwd, path: abs("linux-empty") })).toBeNull();
		});

		test("should search the current directory for an empty PATH entry", () => {
			const cwd = abs("linux-empty-path");
			const target = exe(cwd, "tool");

			expect(whichSync("tool", { cwd, path: "" })).toBe(target);
		});

		test("should ignore pathExt", () => {
			const bin = abs("linux-ignore-pathext");
			create(bin, "tool.EXE");

			expect(whichSync("tool", { cwd: root, path: bin, pathExt: ".EXE" })).toBeNull();
		});

		test("should return `null` for a non-executable path command", () => {
			const dir = abs("linux-noexec-path");
			fs.mkdirSync(dir, { recursive: true });
			const target = path.join(dir, "tool");
			fs.writeFileSync(target, "");
			fs.chmodSync(target, 0o644);

			expect(whichSync(target, { cwd: root })).toBeNull();
		});

		test("should resolve a command containing a path separator directly", () => {
			const target = exe(abs("linux-rel"), "tool");

			expect(whichSync(path.join("linux-rel", "tool"), { cwd: root, path: abs("linux-other") })).toBe(target);
		});

		test("should return `null` for a missing command containing a path separator", () => {
			expect(whichSync(path.join("linux-rel", "missing"), { cwd: root, path: abs("linux-other") })).toBeNull();
		});
	});
});
