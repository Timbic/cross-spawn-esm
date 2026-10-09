import { describe, expect, test } from "vitest";
import { pathKey } from "~/utils/path-key.ts";
import { isWin } from "~/utils/constants";

type NonWinPlatform = Exclude<NodeJS.Platform, "win32">;

const nonWinPlatforms = [
	"aix",
	"android",
	"cygwin",
	"darwin",
	"freebsd",
	"haiku",
	"linux",
	"netbsd",
	"openbsd",
	"sunos",
] satisfies NonWinPlatform[];

describe.concurrent("pathKey", () => {
	test("should default to the current env and platform", () => {
		const key = pathKey();

		expect(key.toUpperCase()).toBe("PATH");
		expect(Object.keys(process.env)).toContain(key);
		expect(pathKey({ env: { PATH: "" } })).toBe("PATH");
	});

	test("should read the path value from a custom env", () => {
		const env: NodeJS.ProcessEnv = { Path: "C:\\Windows\\System32" };
		const key = pathKey({ env, platform: "win32" });

		expect(key).toBe("Path");
		expect(env[key]).toBe("C:\\Windows\\System32");
		expect(env.PATH).toBeUndefined();
	});

	describe("windows mock", () => {
		test("should return `Path` if env has no path key", () => {
			expect(pathKey({ env: {}, platform: "win32" })).toBe("Path");
		});

		test("should return the env key matching path case-insensitively", () => {
			expect(pathKey({ env: { path: "value" }, platform: "win32" })).toBe("path");
			expect(pathKey({ env: { Path: "value" }, platform: "win32" })).toBe("Path");
			expect(pathKey({ env: { PATH: "value" }, platform: "win32" })).toBe("PATH");
			expect(pathKey({ env: { PaTh: "value" }, platform: "win32" })).toBe("PaTh");
		});

		test("should ignore env keys that are not exactly `PATH`", () => {
			expect(pathKey({ env: { PATHEXT: "" }, platform: "win32" })).toBe("Path");
			expect(pathKey({ env: { NODE_PATH: "", PATH: "" }, platform: "win32" })).toBe("PATH");
		});

		test("should only consider own env keys", () => {
			const env: NodeJS.ProcessEnv = Object.create({ PATH: "value" });

			expect(pathKey({ env, platform: "win32" })).toBe("Path");
		});

		test("should return a path key with an undefined value", () => {
			expect(pathKey({ env: { Path: undefined }, platform: "win32" })).toBe("Path");
		});

		test("should return the last matching env key if env has several path variants", () => {
			expect(pathKey({ env: { Path: "", PATH: "" }, platform: "win32" })).toBe("PATH");
			expect(pathKey({ env: { PATH: "", Path: "" }, platform: "win32" })).toBe("Path");
			expect(pathKey({ env: { PATH: "", Path: "", CD: "" }, platform: "win32" })).toBe("Path");
		});
	});

	describe.each(nonWinPlatforms)("%s mock", (platform) => {
		test("should return `PATH` regardless of the env keys", () => {
			expect(pathKey({ env: { path: "value", Path: "value" }, platform })).toBe("PATH");
			expect(pathKey({ env: { PATH: "value", Path: "value" }, platform })).toBe("PATH");
			expect(pathKey({ env: {}, platform })).toBe("PATH");
			expect(pathKey({ platform })).toBe("PATH");
		});
	});

	describe.runIf(isWin)("windows", () => {
		test("should return `Path` if env has no path key", () => {
			expect(pathKey({ env: {} })).toBe("Path");
		});

		test("should return the env key matching path case-insensitively", () => {
			expect(pathKey({ env: { path: "value" } })).toBe("path");
			expect(pathKey({ env: { Path: "value" } })).toBe("Path");
			expect(pathKey({ env: { PATH: "value" } })).toBe("PATH");
			expect(pathKey({ env: { PaTh: "value" } })).toBe("PaTh");
		});

		test("should ignore env keys that are not exactly `PATH`", () => {
			expect(pathKey({ env: { PATHEXT: "" } })).toBe("Path");
			expect(pathKey({ env: { NODE_PATH: "", PATH: "" } })).toBe("PATH");
		});

		test("should only consider own env keys", () => {
			const env: NodeJS.ProcessEnv = Object.create({ PATH: "value" });

			expect(pathKey({ env })).toBe("Path");
		});

		test("should return a path key with an undefined value", () => {
			expect(pathKey({ env: { Path: undefined } })).toBe("Path");
		});

		test("should return the last matching env key if env has several path variants", () => {
			expect(pathKey({ env: { Path: "", PATH: "" } })).toBe("PATH");
			expect(pathKey({ env: { PATH: "", Path: "" } })).toBe("Path");
			expect(pathKey({ env: { PATH: "", Path: "", CD: "" } })).toBe("Path");
		});
	});

	describe.runIf(!isWin)("linux", () => {
		test("should return `PATH` regardless of the env keys", () => {
			expect(pathKey({ env: { path: "value", Path: "value" } })).toBe("PATH");
			expect(pathKey({ env: { PATH: "value", Path: "value" } })).toBe("PATH");
			expect(pathKey({ env: {} })).toBe("PATH");
			expect(pathKey()).toBe("PATH");
		});
	});
});
