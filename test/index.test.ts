import type { SpawnOptions } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { mkdirpSync } from "mkdirp";
import { rimrafSync } from "rimraf";
import { _utils } from "../src/index.ts";
import { _env, isWin } from "../src/utils/constants.ts";
import { run, methods, isMethodSync, isForceShell } from "./util/run";

const pathKey = _utils.pathKey();
const dir = import.meta.dirname;

type SpawnError = Error & {
	code?: string;
	syscall?: string;
	path?: string;
	spawnargs?: string[];
	exitCode?: number;
};

methods.forEach((method) => {
	describe(method, () => {
		const originalPathEnv = _env[pathKey];

		beforeAll(() => mkdirpSync(`${dir}/tmp`));
		afterAll(() => rimrafSync(`${dir}/tmp`));
		afterEach(() => {
			vi.restoreAllMocks();
			_env[pathKey] = originalPathEnv;
		});

		it("should expand using PATHEXT properly", async () => {
			const { stdout } = await run(method, `${dir}/fixtures/say-foo`);
			expect(stdout!.trim()).toBe("foo");
		});

		it("should support shebang in executables with `/usr/bin/env`", async () => {
			const { stdout: stdout1 } = await run(method, `${dir}/fixtures/shebang`);
			expect(stdout1).toBe("shebang works!");

			// Test if the actual shebang file is resolved against the options.env.PATH
			const { stdout: stdout2 } = await run(method, "shebang", {
				env: {
					..._env,
					[pathKey]: path.normalize(`${dir}/fixtures`) + path.delimiter + _env[pathKey],
				},
			});
			expect(stdout2).toBe("shebang works!");

			// Test if the actual shebang file is resolved against the _env.PATH
			_env[pathKey] = path.normalize(`${dir}/fixtures`) + path.delimiter + _env[pathKey];

			const { stdout: stdout3 } = await run(method, "shebang");
			expect(stdout3).toBe("shebang works!");
		});

		it("should handle commands with special shell chars", async () => {
			fs.writeFileSync(`${dir}/tmp/()%!^&;, `, fs.readFileSync(`${dir}/fixtures/pre_()%!^&;, .sh`), {
				mode: 0o0777,
			});
			fs.writeFileSync(`${dir}/tmp/()%!^&;, .bat`, fs.readFileSync(`${dir}/fixtures/pre_()%!^&;, .bat`));

			const { stdout } = await run(method, `${dir}/tmp/()%!^&;, `);
			expect(stdout!.trim()).toBe("special");
		});

		it("should handle empty arguments and arguments with spaces", async () => {
			const { stdout } = await run(method, "node", [`${dir}/fixtures/echo`, "foo", "", "bar", "André Cruz"]);
			expect(stdout).toBe("foo\n\nbar\nAndré Cruz");
		});

		it("should handle non-string arguments", async () => {
			const { stdout } = await run(method, "node", [`${dir}/fixtures/echo`, 1234]);
			expect(stdout).toBe("1234");
		});

		it("should handle arguments with shell special chars", async () => {
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

		if (isWin) {
			it("should double escape when executing `node_modules/.bin/<file>.cmd`", async () => {
				mkdirpSync(`${dir}/tmp/node_modules/.bin`);
				fs.writeFileSync(`${dir}/tmp/node_modules/.bin/echo-cmd-shim.cmd`, fs.readFileSync(`${dir}/fixtures/echo-cmd-shim.cmd`));
				fs.writeFileSync(`${dir}/tmp/echo.js`, fs.readFileSync(`${dir}/fixtures/echo.js`));

				const arg = '"(foo|bar>baz|foz)"';

				const { stdout } = await run(method, `${dir}/tmp/node_modules/.bin/echo-cmd-shim`, [arg]);
				expect(stdout).toBe(arg);
			});
		}

		it("should handle commands with names of environment variables", async () => {
			const { stdout } = await run(method, `${dir}/fixtures/%CD%`);
			expect(stdout!.trim()).toBe("special");
		});

		it("should handle optional spawn optional arguments correctly", async () => {
			const { stdout: stdout1 } = await run(method, `${dir}/fixtures/say-foo`);
			expect(stdout1!.trim()).toBe("foo");

			const { stdout: stdout2 } = await run(method, `${dir}/fixtures/say-foo`, { stdio: "ignore" });
			expect(stdout2).toBe(null);

			const { stdout: stdout3 } = await run(method, `${dir}/fixtures/say-foo`, null, { stdio: "ignore" });
			expect(stdout3).toBe(null);
		});

		it("should not mutate args nor options", async () => {
			const args: string[] = [];
			const options: SpawnOptions = {};

			await run(method, `${dir}/fixtures/say-foo`, args, options);
			expect(args).toEqual([]);
			expect(options).toEqual({});
		});

		it("should give correct exit code", async () => {
			expect.assertions(1);

			try {
				await run(method, "node", [`${dir}/fixtures/exit-25`]);
			} catch (err) {
				expect((err as SpawnError).exitCode).toBe(25);
			}
		});

		it("should work with a relative posix path to a command", async () => {
			const relativeFixturesPath = path.relative(process.cwd(), `${dir}/fixtures`).replace(/\\/, "/");

			const { stdout: stdout1 } = await run(method, `${relativeFixturesPath}/say-foo`);
			expect(stdout1!.trim()).toBe("foo");

			const { stdout: stdout2 } = await run(method, `./${relativeFixturesPath}/say-foo`);
			expect(stdout2!.trim()).toBe("foo");

			if (!isWin) return;

			const { stdout: stdout3 } = await run(method, `./${relativeFixturesPath}/say-foo.bat`);
			expect(stdout3!.trim()).toBe("foo");
		});

		it("should work with a relative posix path to a command with a custom `cwd`", async () => {
			const relativeTestPath = path.relative(process.cwd(), dir).replace(/\\/, "/");

			const { stdout: stdout1 } = await run(method, "fixtures/say-foo", { cwd: relativeTestPath });
			expect(stdout1!.trim()).toBe("foo");

			const { stdout: stdout2 } = await run(method, "./fixtures/say-foo", { cwd: `./${relativeTestPath}` });
			expect(stdout2!.trim()).toBe("foo");

			if (!isWin) return;

			const { stdout: stdout3 } = await run(method, "./fixtures/say-foo.bat", { cwd: `./${relativeTestPath}` });
			expect(stdout3!.trim()).toBe("foo");
		});

		{
			const assertError = (err: Error) => {
				console.log(err);

				const e = err as SpawnError;
				const syscall = isMethodSync(method) ? "spawnSync" : "spawn";

				expect(e.message).toMatch(syscall);
				expect(e.message).toMatch("ENOENT");
				expect(e.message).not.toMatch("undefined");
				expect(e.code).toBe("ENOENT");
				expect(e.syscall).toMatch(syscall);
				expect(e.syscall).not.toMatch("undefined");
				expect(e.path).toMatch("somecommandthatwillneverexist");
				expect(e.spawnargs).toEqual(["foo"]);
			};

			if (isMethodSync(method)) {
				it("should fail with ENOENT if the command does not exist", () => {
					expect.assertions(8);

					try {
						run(method, "somecommandthatwillneverexist", ["foo"]);
					} catch (err) {
						assertError(err as Error);
					}
				});
			} else {
				it("should emit `error` and `close` if command does not exist", async () => {
					expect.assertions(10);

					await new Promise((resolve, reject) => {
						const promise = run(method, "somecommandthatwillneverexist", ["foo"]);
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
			}
		}

		if (isMethodSync(method)) {
			it("should NOT fail with ENOENT if the command actual exists but exited with 1", () => {
				expect.assertions(1);

				try {
					run(method, `${dir}/fixtures/exit-1`);
				} catch (err) {
					expect((err as SpawnError).code).not.toBe("ENOENT");
				}
			});
		} else {
			it("should NOT emit `error` if the command actual exists but exited with 1", async () => {
				await new Promise((resolve, reject) => {
					const promise = run(method, `${dir}/fixtures/exit-1`);
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
		}

		if (isMethodSync(method)) {
			it("should NOT fail with ENOENT if shebang command does not exist", () => {
				expect.assertions(1);

				try {
					run(method, `${dir}/fixtures/shebang-enoent`);
				} catch (err) {
					expect((err as SpawnError).code).not.toBe("ENOENT");
				}
			});
		} else {
			it("should NOT emit `error` if shebang command does not exist", async () => {
				await new Promise((resolve, reject) => {
					const promise = run(method, `${dir}/fixtures/shebang-enoent`);
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
		}

		if (isMethodSync(method)) {
			it("should fail with ENOENT a non-existing `cwd` was specified", () => {
				expect.assertions(1);

				try {
					run(method, "fixtures/say-foo", { cwd: "somedirthatwillneverexist" });
				} catch (err) {
					expect((err as SpawnError).code).toBe("ENOENT");
				}
			});
		} else {
			it("should emit `error` and `close` if a non-existing `cwd` was specified", async () => {
				expect.assertions(3);

				await new Promise((resolve, reject) => {
					const promise = run(method, "somecommandthatwillneverexist", ["foo"]);
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
		}

		if (isWin) {
			it("should use nodejs' spawn when options.shell is specified (windows)", async () => {
				const { stdout } = await run(method, "echo", ["%RANDOM%"], { shell: true });
				expect(stdout!.trim()).toMatch(/\d+/);
			});
		} else {
			it("should use nodejs' spawn when options.shell is specified (linux)", async () => {
				const { stdout } = await run(method, "echo", ["hello &&", "echo there"], { shell: true });
				expect(stdout!.trim()).toEqual("hello\nthere");
			});
		}

		if (isWin && !isForceShell(method)) {
			it("should NOT spawn a shell for a .exe", async () => {
				const { stdout } = await run(method, process.execPath, ["-e", "console.log(process.ppid)"]);
				expect(Number(stdout!.trim())).toBe(process.pid);
			});
		}

		if (isWin) {
			const differentPathKey = pathKey.startsWith("p") ? "PATH" : "path";

			it("should work if the path key is different in options.env", async () => {
				const env = {
					..._env,
					[differentPathKey]: `${dir}\\fixtures;${_env[pathKey]}`,
				};

				Reflect.deleteProperty(env, pathKey);

				const { stdout } = await run(method, "whoami", { env });
				expect(stdout!.trim()).toBe("you sure are someone");
			});
		}
	});
});
