import fs from "node:fs";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { describe, test, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import type { SpawnError } from "~/enoent.ts";
import type { SpawnOptions } from "~/utils/types.ts";
import { pathKey } from "~/utils/path-key.ts";
import { _env, isWin } from "~/utils/constants.ts";
import { makeTempDir, removeDir } from "./utils/helpers.ts";
import { run, methods, isMethodSync, isForceShell, type CommandError, type RunPromise } from "./run";

const key = pathKey();
const dir = import.meta.dirname;

describe.each(methods)("%s", (method) => {
	const originalPathEnv = _env[key];
	let tmpDir: string;

	beforeAll(() => {
		tmpDir = makeTempDir("cross-spawn-esm-index-");
		fs.mkdirSync(path.join(tmpDir, "tmp"), { recursive: true });
	});
	afterAll(() => removeDir(tmpDir));

	afterEach(() => {
		_env[key] = originalPathEnv;
	});

	test("should expand using PATHEXT properly", async () => {
		const { stdout } = await run(method, `${dir}/fixtures/say-foo`);
		expect(stdout!.trim()).toBe("foo");
	});

	test("should support shebang in executables with `/usr/bin/env`", async () => {
		const { stdout: stdout1 } = await run(method, `${dir}/fixtures/shebang`);
		expect(stdout1).toBe("shebang works!");

		// Test if the actual shebang file is resolved against the options.env.PATH
		const { stdout: stdout2 } = await run(method, "shebang", {
			env: {
				..._env,
				[key]: path.normalize(`${dir}/fixtures`) + path.delimiter + _env[key],
			},
		});
		expect(stdout2).toBe("shebang works!");

		// Test if the actual shebang file is resolved against the _env.PATH
		_env[key] = path.normalize(`${dir}/fixtures`) + path.delimiter + _env[key];

		const { stdout: stdout3 } = await run(method, "shebang");
		expect(stdout3).toBe("shebang works!");
	});

	test("should handle commands with special shell chars", async () => {
		fs.writeFileSync(path.join(tmpDir, "tmp", "()%!^&;, "), fs.readFileSync(`${dir}/fixtures/pre_()%!^&;, .sh`), {
			mode: 0o0777,
		});
		fs.writeFileSync(path.join(tmpDir, "tmp", "()%!^&;, .bat"), fs.readFileSync(`${dir}/fixtures/pre_()%!^&;, .bat`));

		const { stdout } = await run(method, path.join(tmpDir, "tmp", "()%!^&;, "));
		expect(stdout!.trim()).toBe("special");
	});

	test("should handle empty arguments and arguments with spaces", async () => {
		const { stdout } = await run(method, "node", [`${dir}/fixtures/echo`, "foo", "", "bar", "André Cruz"]);
		expect(stdout).toBe("foo\n\nbar\nAndré Cruz");
	});

	test("should handle non-string arguments", async () => {
		const { stdout } = await run(method, "node", [`${dir}/fixtures/echo`, 1234]);
		expect(stdout).toBe("1234");
	});

	test("should handle arguments with shell special chars", async () => {
		const args = [
			"foo",
			"()",
			"foo",
			"[]",
			"foo",
			"%!",
			"foo",
			"^<",
			"foo",
			">&",
			"foo",
			"|;",
			"foo",
			", ",
			"foo",
			"!=",
			"foo",
			"\\*",
			"foo",
			'"f"',
			"foo",
			"?.",
			"foo",
			"=`",
			"foo",
			"'",
			"foo",
			'\\"',
			"bar\\",
			'"foo|bar>baz"',
			'"(foo|bar>baz|foz)"',
		];

		const { stdout } = await run(method, "node", [`${dir}/fixtures/echo`].concat(args));
		expect(stdout).toBe(args.join("\n"));
	});

	test.runIf(!isWin)("should handle commands with names of environment variables", async () => {
		const { stdout } = await run(method, `${dir}/fixtures/%CD%`);
		expect(stdout!.trim()).toBe("special");
	});

	test.runIf(isWin)("should reject batch commands with environment-variable names in strict mode", () => {
		// `%CD%` is expanded by cmd.exe before the batch file is located, so it
		// cannot be escaped reliably. The extensionless `%CD%` fixture resolves
		// to `%CD%.bat` through PATHEXT on Windows.
		expect(() => run(method, `${dir}/fixtures/%CD%`, { batchMode: "strict" })).toThrow(/percent sign/);
	});

	test.runIf(isWin)("should reject batch arguments containing a percent sign in strict mode", () => {
		const bat = path.join(tmpDir, "tmp", "echo-args.bat");
		fs.writeFileSync(bat, "@echo off\r\necho %1\r\n");

		expect(() => run(method, bat, ["100%"], { batchMode: "strict" })).toThrow(/percent sign/);
	});

	test.runIf(isWin)("should reject batch files when `batchMode` is `reject`", () => {
		const bat = path.join(tmpDir, "tmp", "reject.bat");
		fs.writeFileSync(bat, "@echo off\r\necho safe\r\n");

		expect(() => run(method, bat, [], { batchMode: "reject" })).toThrow(/batchMode is "reject"/);
	});

	test.runIf(isWin)("should not allow command injection through batch arguments in strict mode", async () => {
		const bat = path.join(tmpDir, "tmp", "injection.bat");
		const flag = path.join(tmpDir, "tmp", "pwned.flag");
		fs.rmSync(flag, { force: true });
		fs.writeFileSync(bat, "@echo off\r\necho safe\r\n");

		const payload = '"& echo pwned>pwned.flag';
		const { stdout } = await run(method, bat, [payload], { cwd: path.dirname(bat), batchMode: "strict" });

		expect(stdout!.trim()).toBe("safe");
		expect(fs.existsSync(flag)).toBe(false);
	});

	test.runIf(isWin)("should keep quote-break payloads inside a `%*` batch in strict mode", async () => {
		const bat = path.join(tmpDir, "tmp", "forward-args.bat");
		const flag = path.join(tmpDir, "tmp", "pwned-forward.flag");
		fs.rmSync(flag, { force: true });
		fs.writeFileSync(bat, "@echo off\r\necho %*\r\n");

		const payload = '" & echo pwned>pwned-forward.flag & rem "';
		const { stdout } = await run(method, bat, [payload], { cwd: path.dirname(bat), batchMode: "strict" });

		expect(stdout).toContain("pwned-forward.flag");
		expect(fs.existsSync(flag)).toBe(false);
	});

	test("should handle optional spawn optional arguments correctly", async () => {
		const { stdout: stdout1 } = await run(method, `${dir}/fixtures/say-foo`);
		expect(stdout1!.trim()).toBe("foo");

		const { stdout: stdout2 } = await run(method, `${dir}/fixtures/say-foo`, { stdio: "ignore" });
		expect(stdout2).toBe(null);

		const { stdout: stdout3 } = await run(method, `${dir}/fixtures/say-foo`, null, { stdio: "ignore" });
		expect(stdout3).toBe(null);
	});

	test("should not mutate args nor options", async () => {
		const args: string[] = [];
		const options: SpawnOptions = {};

		await run(method, `${dir}/fixtures/say-foo`, args, options);
		expect(args).toEqual([]);
		expect(options).toEqual({});
	});

	test("should give correct exit code", async () => {
		expect.assertions(1);

		try {
			await run(method, "node", [`${dir}/fixtures/exit-25`]);
		} catch (err) {
			expect((err as CommandError).exitCode).toBe(25);
		}
	});

	test("should work with a relative posix path to a command", async () => {
		const relativeFixturesPath = path.relative(process.cwd(), `${dir}/fixtures`).replace(/\\/, "/");

		const { stdout: stdout1 } = await run(method, `${relativeFixturesPath}/say-foo`);
		expect(stdout1!.trim()).toBe("foo");

		const { stdout: stdout2 } = await run(method, `./${relativeFixturesPath}/say-foo`);
		expect(stdout2!.trim()).toBe("foo");

		if (!isWin) return;

		const { stdout: stdout3 } = await run(method, `./${relativeFixturesPath}/say-foo.bat`);
		expect(stdout3!.trim()).toBe("foo");
	});

	test("should work with a relative posix path to a command with a custom `cwd`", async () => {
		const relativeTestPath = path.relative(process.cwd(), dir).replace(/\\/, "/");

		const { stdout: stdout1 } = await run(method, "fixtures/say-foo", { cwd: relativeTestPath });
		expect(stdout1!.trim()).toBe("foo");

		const { stdout: stdout2 } = await run(method, "./fixtures/say-foo", { cwd: `./${relativeTestPath}` });
		expect(stdout2!.trim()).toBe("foo");

		if (!isWin) return;

		const { stdout: stdout3 } = await run(method, "./fixtures/say-foo.bat", { cwd: `./${relativeTestPath}` });
		expect(stdout3!.trim()).toBe("foo");
	});

	function assertError(err: SpawnError) {
		const e = err;
		const syscall = isMethodSync(method) ? "spawnSync" : "spawn";

		expect(e.message).toMatch(syscall);
		expect(e.message).toMatch("ENOENT");
		expect(e.message).not.toMatch("undefined");
		expect(e.code).toBe("ENOENT");
		expect(e.syscall).toMatch(syscall);
		expect(e.syscall).not.toMatch("undefined");
		expect(e.path).toMatch("somecommandthatwillneverexist");
		expect(e.spawnargs).toEqual(["foo"]);
	}

	describe.runIf(isMethodSync(method))("sync only", () => {
		test("should fail with ENOENT if the command does not exist", () => {
			expect.assertions(8);

			try {
				run(method, "somecommandthatwillneverexist", ["foo"]);
			} catch (err) {
				assertError(err as SpawnError);
			}
		});

		test("should NOT fail with ENOENT if the command actual exists but exited with 1", () => {
			expect.assertions(1);

			try {
				run(method, `${dir}/fixtures/exit-1`);
			} catch (err) {
				expect((err as SpawnError).code).not.toBe("ENOENT");
			}
		});

		test("should NOT fail with ENOENT if shebang command does not exist", () => {
			expect.assertions(1);

			try {
				run(method, `${dir}/fixtures/shebang-enoent`);
			} catch (err) {
				expect((err as SpawnError).code).not.toBe("ENOENT");
			}
		});

		test("should fail with ENOENT a non-existing `cwd` was specified", () => {
			expect.assertions(1);

			try {
				run(method, "fixtures/say-foo", { cwd: "somedirthatwillneverexist" });
			} catch (err) {
				expect((err as SpawnError).code).toBe("ENOENT");
			}
		});
	});

	describe.runIf(!isMethodSync(method))("async only", () => {
		test("should emit `error` and `close` if command does not exist", async () => {
			expect.assertions(10);

			await new Promise((resolve, reject) => {
				const promise = run(method, "somecommandthatwillneverexist", ["foo"]) as RunPromise;
				const { cp } = promise;

				promise.catch(() => {});

				let timeout: NodeJS.Timeout;

				cp.on("error", assertError)
					.on("exit", () => {
						cp.removeAllListeners();
						clearTimeout(timeout);
						reject(new Error("Should not emit exit"));
					})
					.on("close", (code, signal) => {
						expect(code).not.toBe(0);
						expect(signal).toBe(null);

						timeout = setTimeout(resolve, 1000);
					});
			});
		});

		test("should NOT emit `error` if the command actual exists but exited with 1", async () => {
			await new Promise((resolve, reject) => {
				const promise = run(method, `${dir}/fixtures/exit-1`) as RunPromise;
				const { cp } = promise;

				promise.catch(() => {});

				const onExit = vi.fn(() => {});
				let timeout: NodeJS.Timeout;

				cp.on("error", () => {
					cp.removeAllListeners();
					clearTimeout(timeout);
					reject(new Error("Should not emit error"));
				})
					.on("exit", onExit)
					.on("close", (code, signal) => {
						expect(code).toBe(1);
						expect(signal).toBe(null);
						expect(onExit).toHaveBeenCalledTimes(1);
						expect(onExit).toHaveBeenCalledWith(1, null);

						timeout = setTimeout(resolve, 1000);
					});
			});
		});

		test("should NOT emit `error` if shebang command does not exist", async () => {
			await new Promise((resolve, reject) => {
				const promise = run(method, `${dir}/fixtures/shebang-enoent`) as RunPromise;
				const { cp } = promise;

				promise.catch(() => {});

				const onExit = vi.fn(() => {});
				let timeout: NodeJS.Timeout;

				cp.on("error", () => {
					cp.removeAllListeners();
					clearTimeout(timeout);
					reject(new Error("Should not emit error"));
				})
					.on("exit", onExit)
					.on("close", (code, signal) => {
						expect(code).not.toBe(0);
						expect(signal).toBe(null);
						expect(onExit).toHaveBeenCalledTimes(1);
						expect(onExit).not.toHaveBeenCalledWith(0, null);

						timeout = setTimeout(resolve, 1000);
					});
			});
		});

		test("should emit `error` and `close` if a non-existing `cwd` was specified", async () => {
			expect.assertions(3);

			await new Promise((resolve, reject) => {
				const promise = run(method, "somecommandthatwillneverexist", ["foo"]) as RunPromise;
				const { cp } = promise;

				promise.catch(() => {});

				let timeout: NodeJS.Timeout;

				cp.on("error", (err) => expect((err as SpawnError).code).toBe("ENOENT"))
					.on("exit", () => {
						cp.removeAllListeners();
						clearTimeout(timeout);
						reject(new Error("Should not emit exit"));
					})
					.on("close", (code, signal) => {
						expect(code).not.toBe(0);
						expect(signal).toBe(null);

						timeout = setTimeout(resolve, 1000);
					});
			});
		});
	});

	describe.runIf(isWin)("windows", () => {
		test("should double escape when executing `node_modules/.bin/<file>.cmd`", async () => {
			fs.mkdirSync(path.join(tmpDir, "tmp", "node_modules", ".bin"), { recursive: true });
			fs.writeFileSync(
				path.join(tmpDir, "tmp", "node_modules", ".bin", "echo-cmd-shim.cmd"),
				fs.readFileSync(`${dir}/fixtures/echo-cmd-shim.cmd`),
			);
			fs.writeFileSync(path.join(tmpDir, "tmp", "echo.js"), fs.readFileSync(`${dir}/fixtures/echo.js`));

			const arg = '"(foo|bar>baz|foz)"';
			const shim = path.join(tmpDir, "tmp", "node_modules", ".bin", "echo-cmd-shim");

			const { stdout } = await run(method, shim, [arg]);
			expect(stdout).toBe(arg);

			// The shim forwards `%*` to Node, so a payload that would otherwise
			// inject a second command must arrive as a single argument.
			const flag = path.join(tmpDir, "tmp", "pwned-shim.flag");
			fs.rmSync(flag, { force: true });
			const payload = '"& echo pwned>pwned-shim.flag';
			const { stdout: stdout2 } = await run(method, shim, [payload], { cwd: path.join(tmpDir, "tmp") });

			expect(stdout2).toBe(payload);
			expect(fs.existsSync(flag)).toBe(false);
		});

		test("should use nodejs' spawn when options.shell is specified (windows)", async () => {
			const { stdout } = await run(method, "echo", ["%RANDOM%"], { shell: true });
			expect(stdout!.trim()).toMatch(/\d+/);
		});

		const differentPathKey = key.startsWith("p") ? "PATH" : "path";

		test("should work if the path key is different in options.env", async () => {
			const env = {
				..._env,
				[differentPathKey]: `${dir}\\fixtures;${_env[key]}`,
			};

			Reflect.deleteProperty(env, key);

			const { stdout } = await run(method, "whoami", { env });
			expect(stdout!.trim()).toBe("you sure are someone");
		});

		test.runIf(!isForceShell(method))("should NOT spawn a shell for a .exe", async () => {
			const { stdout } = await run(method, process.execPath, ["-e", "console.log(process.ppid)"]);
			expect(Number(stdout!.trim())).toBe(process.pid);
		});

		test.runIf(isForceShell(method))("should work with _forceShell when command path contains spaces", async () => {
			const { stdout } = await run(method, process.execPath, ["-e", "console.log('ok')"]);
			expect(stdout).toContain("ok");
		});
	});

	describe.runIf(!isWin)("linux", () => {
		test("should use nodejs' spawn when options.shell is specified (linux)", async () => {
			const { stdout } = await run(method, "echo", ["hello &&", "echo there"], { shell: true });
			expect(stdout!.trim()).toEqual("hello\nthere");
		});
	});
});

describe.runIf(isWin)("worker threads", () => {
	test("should resolve a relative command with a custom cwd when process.chdir is unavailable", async () => {
		interface WorkerResult {
			chdirError: string | null;
			status: number | null;
			error?: string;
			stdout?: string;
		}

		const worker = new Worker(new URL("./fixtures/worker-relative-cwd.mjs", import.meta.url));

		const result = await new Promise<WorkerResult>((resolve, reject) => {
			worker.once("message", resolve);
			worker.once("error", reject);
		});

		await worker.terminate();

		expect(result.chdirError).not.toBeNull();
		expect(result.error).toBeUndefined();
		expect(result.status).toBe(0);
		expect(result.stdout).toBe("shebang works!");
	});
});
