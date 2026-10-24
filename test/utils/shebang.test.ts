import fs from "node:fs";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { detectShebang, readShebang, shebangCommand } from "~/utils/shebang.ts";
import { isWin } from "~/utils/constants.ts";
import { createExecutable, joinWithDelimiter, makeTempDir, parsedCommand, removeDir } from "./helpers";

describe.concurrent("shebangCommand", () => {
	test("should return the interpreter for a plain shebang", () => {
		expect(shebangCommand("#!/bin/sh")).toBe("sh");
		expect(shebangCommand("#!/sh")).toBe("sh");
	});

	test("should return `binary <argument>` when the interpreter has an argument", () => {
		expect(shebangCommand("#!/bin/bash -e")).toBe("bash -e");
	});

	test("should return only the argument for `/usr/bin/env`", () => {
		expect(shebangCommand("#!/usr/bin/env node")).toBe("node");
		expect(shebangCommand("#!/usr/bin/env node --flag")).toBe("node");
	});

	test("should return `env` when `/usr/bin/env` has no argument", () => {
		expect(shebangCommand("#!/usr/bin/env")).toBe("env");
	});

	test("should tolerate extra whitespace after the shebang marker", () => {
		expect(shebangCommand("#! /usr/bin/env node")).toBe("node");
		expect(shebangCommand("#! /bin/bash")).toBe("bash");
		expect(shebangCommand("#! /bin/bash -ex")).toBe("bash -ex");
		expect(shebangCommand("#!  /bin/sh")).toBe("sh");
	});

	test("should treat tabs like other whitespace", () => {
		expect(shebangCommand("#!/usr/bin/env\tnode")).toBe("node");
		expect(shebangCommand("#!/bin/bash\t-ex")).toBe("bash -ex");
	});

	test("should tolerate extra whitespace between the interpreter and its argument", () => {
		expect(shebangCommand("#!/bin/sh  -e")).toBe("sh -e");
	});

	test("should tolerate a windows line ending", () => {
		expect(shebangCommand("#!/usr/bin/env node\r\n")).toBe("node");
	});

	test("should return `null` when there is no shebang", () => {
		expect(shebangCommand("not a shebang")).toBeNull();
		expect(shebangCommand(" #!/bin/sh")).toBeNull();
		expect(shebangCommand("")).toBeNull();
		expect(shebangCommand(undefined as unknown as string)).toBeNull();
	});
});

describe("readShebang", () => {
	let dir: string;

	function file(name: string) {
		return path.join(dir, name);
	}

	beforeAll(() => {
		dir = makeTempDir("cross-spawn-esm-shebang-");
		fs.writeFileSync(file("script"), "#!/usr/bin/env node\r\nconsole.log(1)");
		fs.writeFileSync(file("plain"), "module.exports = 1;");
		fs.writeFileSync(file("deep"), `${"x".repeat(200)}\n#!/bin/sh`);
	});

	afterAll(() => removeDir(dir));

	test("should return the shebang command", () => {
		expect(readShebang(file("script"))).toBe("node");
	});

	test("should return `null` when the file has no shebang", () => {
		expect(readShebang(file("plain"))).toBeNull();
	});

	test("should only inspect the first 150 bytes", () => {
		expect(readShebang(file("deep"))).toBeNull();
	});

	test("should return `null` when the file does not exist", () => {
		expect(readShebang(file("missing"))).toBeNull();
	});

	describe("descriptor handling", () => {
		afterEach(() => vi.restoreAllMocks());

		test("should close the descriptor when reading fails, including descriptor zero", () => {
			vi.spyOn(fs, "openSync").mockReturnValue(0);
			vi.spyOn(fs, "readSync").mockImplementation(() => {
				throw new Error("read failed");
			});
			const close = vi.spyOn(fs, "closeSync").mockImplementation(() => {});

			expect(readShebang(file("script"))).toBeNull();
			expect(close).toHaveBeenCalledTimes(1);
			expect(close).toHaveBeenCalledWith(0);
		});

		test("should not close a descriptor when opening fails", () => {
			vi.spyOn(fs, "openSync").mockImplementation(() => {
				throw new Error("open failed");
			});
			const close = vi.spyOn(fs, "closeSync").mockImplementation(() => {});

			expect(readShebang(file("script"))).toBeNull();
			expect(close).not.toHaveBeenCalled();
		});

		test("should keep the `null` fallback when closing also fails", () => {
			vi.spyOn(fs, "openSync").mockReturnValue(0);
			vi.spyOn(fs, "readSync").mockImplementation(() => {
				throw new Error("read failed");
			});
			vi.spyOn(fs, "closeSync").mockImplementation(() => {
				throw new Error("close failed");
			});

			expect(readShebang(file("script"))).toBeNull();
		});

		test("should still close the descriptor after a successful read", () => {
			const close = vi.spyOn(fs, "closeSync");

			expect(readShebang(file("script"))).toBe("node");
			expect(close).toHaveBeenCalledTimes(1);
		});

		test("should close the descriptor when reading a directory throws `EISDIR`", () => {
			const open = vi.spyOn(fs, "openSync");
			const close = vi.spyOn(fs, "closeSync");

			expect(readShebang(dir)).toBeNull();
			expect(open).toHaveBeenCalledTimes(1);
			expect(close).toHaveBeenCalledTimes(1);
			expect(close).toHaveBeenCalledWith(open.mock.results[0]!.value);
		});
	});
});

describe.runIf(!isWin)("detectShebang bare `/usr/bin/env` shebang", () => {
	let root: string;
	let bin: string;
	let env: NodeJS.ProcessEnv;

	beforeAll(() => {
		root = makeTempDir("cross-spawn-esm-detect-bare-");
		bin = path.join(root, "bin");

		const script = createExecutable(bin, "bare-env");
		fs.writeFileSync(script, "#!/usr/bin/env\n");

		env = { PATH: joinWithDelimiter(bin, process.env.PATH ?? "") };
	});

	afterAll(() => removeDir(root));

	test("should rewire the script to run via `env`", () => {
		const parsed = parsedCommand("bare-env", { env });
		const resolved = detectShebang(parsed);

		expect(resolved).not.toBeNull();
		expect(path.basename(resolved!)).toBe("env");
		expect(parsed.command).toBe("env");
		expect(parsed.args).toEqual([parsed.file]);
		expect(parsed.file!.toLowerCase()).toBe(path.join(bin, "bare-env").toLowerCase());
	});
});

describe("detectShebang", () => {
	const scriptName = isWin ? "script.cmd" : "script";
	const plainName = isWin ? "plain.cmd" : "plain";
	const fakeName = isWin ? "fake.cmd" : "fake";
	const flaggedName = isWin ? "flagged.cmd" : "flagged";

	let root: string;
	let bin: string;
	let env: NodeJS.ProcessEnv;

	beforeAll(() => {
		root = makeTempDir("cross-spawn-esm-detect-");
		bin = path.join(root, "bin");

		const script = createExecutable(bin, scriptName);
		fs.writeFileSync(script, "#!/usr/bin/env node\nconsole.log('hi')");

		const plain = createExecutable(bin, plainName);
		fs.writeFileSync(plain, "module.exports = 1;");

		const fake = createExecutable(bin, fakeName);
		fs.writeFileSync(fake, "#!/usr/bin/env no-such-interp-xyz\n");

		const flagged = createExecutable(bin, flaggedName);
		fs.writeFileSync(flagged, "#!/bin/bash -e\n");

		env = { PATH: joinWithDelimiter(bin, process.env.PATH ?? "") };
	});

	afterAll(() => removeDir(root));

	test("should rewire a script with a shebang", () => {
		const parsed = parsedCommand("script", { env });
		const resolved = detectShebang(parsed);

		expect(path.basename(resolved!)).toMatch(/^node/);
		expect(parsed.command).toBe("node");
		expect(parsed.args).toEqual([parsed.file]);
		expect(parsed.file!.toLowerCase()).toBe(path.join(bin, scriptName).toLowerCase());
	});

	test("should not mutate the original arguments", () => {
		const parsed = parsedCommand("script", { env });

		detectShebang(parsed);

		expect(parsed.original).toEqual({ command: "script", args: [] });
	});

	test("should return the script path when it has no shebang", () => {
		const parsed = parsedCommand("plain", { env });
		const resolved = detectShebang(parsed);

		expect(resolved!.toLowerCase()).toBe(path.join(bin, plainName).toLowerCase());
		expect(fs.existsSync(resolved!)).toBe(true);
		expect(parsed.command).toBe("plain");
		expect(parsed.args).toEqual([]);
	});

	test("should return `null` when the command cannot be resolved", () => {
		expect(detectShebang(parsedCommand("nope", { env }))).toBeNull();
	});

	test("should return `null` when the shebang interpreter cannot be resolved", () => {
		const parsed = parsedCommand("fake", { env });

		expect(detectShebang(parsed)).toBeNull();
		expect(parsed.command).toBe("no-such-interp-xyz");
		expect(parsed.args).toEqual([parsed.file]);
	});

	test("should not rewire an interpreter that carries an argument", () => {
		const parsed = parsedCommand("flagged", { env });

		expect(detectShebang(parsed)).toBeNull();
		expect(parsed.command).toBe("bash -e");
		expect(parsed.args).toEqual([parsed.file]);
	});
});
