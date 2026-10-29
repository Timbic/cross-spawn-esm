import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { SpawnOptions } from "~/utils/types";
import { _env, isWin } from "~/utils/constants.ts";
import { parse } from "~/parse.ts";
import { createExecutable, createPlatformExecutable, joinWithDelimiter, makeTempDir, removeDir, restoreEnv } from "./utils/helpers";

describe("parse", () => {
	test("should treat a non-array second argument as options", () => {
		const parsed = parse("ls", { cwd: "/tmp", shell: true }, {});

		expect(parsed.args).toEqual([]);
		expect(parsed.options.cwd).toBe("/tmp");
		expect(parsed.original).toEqual({ command: "ls", args: [] });
	});

	test("should clone the input args array", () => {
		const input = ["-l"];
		const parsed = parse("ls", input, { shell: true });

		input.push("-a");
		parsed.args.push("-h");

		expect(input).toEqual(["-l", "-a"]);
		expect(parsed.args).toEqual(["-l", "-h"]);
		expect(parsed.original.args).toEqual(["-l"]);
	});

	test("should clone the input options object", () => {
		const input = { cwd: "/tmp", shell: true };
		const parsed = parse("ls", [], input);

		parsed.options.cwd = "/other";

		expect(input.cwd).toBe("/tmp");
		expect(parsed.options).not.toBe(input);
	});

	test("should pass through untouched when `options.shell` is set", () => {
		const parsed = parse("no-such-tool", ["a&b"], { shell: true });

		expect(parsed.command).toBe("no-such-tool");
		expect(parsed.args).toEqual(["a&b"]);
		expect(parsed.options.windowsVerbatimArguments).toBeUndefined();
		expect(parsed.file).toBeUndefined();
	});

	describe.runIf(isWin)("windows", () => {
		let root: string;
		let bin: string;
		let shimDir: string;

		beforeAll(() => {
			root = makeTempDir("cross-spawn-esm-parse-");
			bin = path.join(root, "bin");
			shimDir = path.join(root, "node_modules", ".bin");

			createPlatformExecutable(bin, "tool");
			createExecutable(bin, "comtool.com");

			const sheb = createExecutable(bin, "sheb.cmd");
			fs.writeFileSync(sheb, "#!/usr/bin/env node\nconsole.log(1);");

			createExecutable(bin, "x.cmd");
			createExecutable(shimDir, "x.cmd");
		});

		afterAll(() => removeDir(root));

		describe("wrapping", () => {
			test("should wrap a non-executable command for cmd.exe", () => {
				const options: SpawnOptions = {};
				const parsed = parse("no-such-tool", ["a b", "x&y"], options);

				expect(parsed.command).toBe(_env.comspec || "cmd.exe");
				expect(parsed.args).toEqual(["/d", "/s", "/c", '"no-such-tool ^"a^ b^" ^"x^&y^""']);
				expect(parsed.options.windowsVerbatimArguments).toBe(true);
				expect(options.windowsVerbatimArguments).toBeUndefined();
			});

			test("should not wrap a resolved `.exe`", () => {
				const parsed = parse("tool", [], { env: { PATH: joinWithDelimiter(bin, process.env.PATH ?? "") } });

				expect(parsed.command).toBe("tool");
				expect(parsed.args).toEqual([]);
				expect(parsed.file!.toLowerCase()).toBe(path.join(bin, "tool.EXE").toLowerCase());
				expect(parsed.options.windowsVerbatimArguments).toBeUndefined();
			});

			test("should not wrap a resolved `.com`", () => {
				const parsed = parse("comtool", [], { env: { PATH: joinWithDelimiter(bin, process.env.PATH ?? "") } });

				expect(parsed.command).toBe("comtool");
				expect(parsed.args).toEqual([]);
				expect(parsed.file!.toLowerCase()).toBe(path.join(bin, "comtool.com").toLowerCase());
				expect(parsed.options.windowsVerbatimArguments).toBeUndefined();
			});

			test("should rewire a shebang script to its interpreter", () => {
				const parsed = parse("sheb", ["one"], { env: { PATH: joinWithDelimiter(bin, process.env.PATH ?? "") } });

				expect(parsed.command).toBe("node");
				expect(parsed.args).toHaveLength(2);
				expect(parsed.args[0]!.toLowerCase()).toBe(path.join(bin, "sheb.cmd").toLowerCase());
				expect(parsed.args[1]).toBe("one");
			});

			test("should keep a shebang interpreter when the command path contains spaces", () => {
				const spacedBin = path.join(root, "Program Files", "shebang");
				const script = createExecutable(spacedBin, "script.cmd");
				fs.writeFileSync(script, "#!/bin/bash -e\n");

				const parsed = parse(script, ["one"], { env: { PATH: joinWithDelimiter(bin, process.env.PATH ?? "") } });

				expect(parsed.command).toBe(_env.comspec || "cmd.exe");
				expect(parsed.args[3]).toContain("bash^ -e");
				expect(parsed.args[3]).toContain("script.cmd");
			});

			test("should use quote-based escaping for a cmd-shim in node_modules/.bin in strict mode", () => {
				const shim = parse("x", ["a&b"], { env: { PATH: shimDir }, batchMode: "strict" });
				const plain = parse("x", ["a&b"], { env: { PATH: bin }, batchMode: "strict" });

				for (const parsed of [shim, plain]) {
					expect(parsed.command).toBe(_env.comspec || "cmd.exe");
					expect(parsed.args.slice(0, 5)).toEqual(["/d", "/e:on", "/v:off", "/s", "/c"]);
					expect(parsed.args[5]).toContain('"a&b"');
					expect(parsed.args[5]).toMatch(/x\.cmd/i);
					expect(parsed.args[5]).not.toContain("^^");
				}
			});

			test("should keep the legacy caret escaping by default", () => {
				const parsed = parse("x", ["a&b"], { env: { PATH: bin } });

				expect(parsed.command).toBe(_env.comspec || "cmd.exe");
				expect(parsed.args).toEqual(["/d", "/s", "/c", '"x ^"a^&b^""']);
				expect(parsed.args).not.toContain("/e:on");
			});

			test("should not reject a percent sign in legacy mode", () => {
				expect(() => parse("x", ["100%"], { env: { PATH: bin } })).not.toThrow();
			});

			test("should reject a batch argument containing a percent sign in strict mode", () => {
				expect(() => parse("x", ["100%"], { env: { PATH: bin }, batchMode: "strict" })).toThrow(/percent sign/);
				expect(() => parse("x", ["%PATH%"], { env: { PATH: bin }, batchMode: "strict" })).toThrow(/percent sign/);
			});

			test("should reject a batch command whose name contains a percent sign in strict mode", () => {
				const percent = createExecutable(bin, "%NAME%.cmd");

				expect(() => parse(percent, [], { batchMode: "strict" })).toThrow(/percent sign/);
			});

			test("should reject a batch command with trailing spaces or dots in strict mode", () => {
				expect(() => parse(path.join(bin, "x.cmd "), [], { env: { PATH: bin }, batchMode: "strict" })).toThrow(/dot or a space/);
				expect(() => parse(path.join(bin, "x.cmd."), [], { env: { PATH: bin }, batchMode: "strict" })).toThrow(/dot or a space/);
			});

			test("should reject batch files when `batchMode` is `reject`", () => {
				expect(() => parse("x", [], { env: { PATH: bin }, batchMode: "reject" })).toThrow(/batchMode is "reject"/);
				expect(() => parse(path.join(bin, "x.cmd"), [], { batchMode: "reject" })).toThrow(/batchMode is "reject"/);
			});

			test("should reject an invalid `batchMode` at runtime", () => {
				expect(() => parse("x", [], { env: { PATH: bin }, batchMode: "invalid" as never })).toThrow(/Invalid batchMode/);
			});

			test("should force the cmd.exe shell with `_forceShell`", () => {
				const parsed = parse("tool", [], {
					env: { PATH: joinWithDelimiter(bin, process.env.PATH ?? "") },
					_forceShell: true,
				} as SpawnOptions);

				expect(parsed.command).toBe(_env.comspec || "cmd.exe");
				expect(parsed.options.windowsVerbatimArguments).toBe(true);
			});

			test("should quote the command when `_forceShell` is used and its path contains spaces", () => {
				const spacedBin = path.join(root, "Program Files", "bin");
				createPlatformExecutable(spacedBin, "tool2");
				const parsed = parse(path.join(spacedBin, "tool2.exe"), [], {
					_forceShell: true,
				} as SpawnOptions);

				expect(parsed.command).toBe(_env.comspec || "cmd.exe");
				expect(parsed.options.windowsVerbatimArguments).toBe(true);
				// The command token inside the `cmd /c "..."` string must be quoted as a
				// whole, otherwise `cmd.exe` splits it on the space and runs `C:\Program`.
				expect(parsed.args[3]).toMatch(/^"\^"[A-Za-z]:/);
			});
		});

		describe("comspec mutation", () => {
			const originalComspec = _env.comspec;

			afterAll(() => restoreEnv({ comspec: originalComspec }));

			test("should use `comspec` when it is set", () => {
				_env.comspec = "C:\\custom-shell.exe";

				expect(parse("no-such-tool", [], {}).command).toBe("C:\\custom-shell.exe");
			});

			test("should fall back to `cmd.exe` when `comspec` is empty", () => {
				_env.comspec = "";

				expect(parse("no-such-tool", [], {}).command).toBe("cmd.exe");
			});

			test("should fall back to `cmd.exe` when `comspec` is unset", () => {
				Reflect.deleteProperty(_env, "comspec");

				expect(parse("no-such-tool", [], {}).command).toBe("cmd.exe");
			});
		});
	});
});

describe.runIf(!isWin)("linux", () => {
	test("should return the parse untouched", () => {
		const parsed = parse("no-such-tool", ["a b&c"], {});

		expect(parsed.command).toBe("no-such-tool");
		expect(parsed.args).toEqual(["a b&c"]);
		expect(parsed.options.windowsVerbatimArguments).toBeUndefined();
		expect(parsed.file).toBeUndefined();
	});
});
