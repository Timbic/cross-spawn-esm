import { describe, expect, test } from "vitest";
import { pathKey } from "~/utils/path-key.ts";

const nonWinPlatforms: NodeJS.Platform[] = ["darwin", "linux", "freebsd", "aix", "sunos"];

describe("pathKey", () => {
	test("should use the current env and platform by default", () => {
		expect(pathKey().toUpperCase()).toBe("PATH");
		expect(pathKey({ env: { PATH: "" } })).toBe("PATH");
	});

	test("should read the path value from a custom env", () => {
		const env: NodeJS.ProcessEnv = { Path: "C:\\Windows\\System32" };
		const key = pathKey({ env, platform: "win32" });

		expect(key).toBe("Path");
		expect(env[key]).toBe("C:\\Windows\\System32");
		expect(env.PATH).toBeUndefined();
	});

	describe("windows", () => {
		test("should return `Path` if env has no path key", () => {
			expect(pathKey({ env: {}, platform: "win32" })).toBe("Path");
		});

		test("should return the env key matching path case-insensitively", () => {
			expect(pathKey({ env: { path: "value" }, platform: "win32" })).toBe("path");
			expect(pathKey({ env: { Path: "value" }, platform: "win32" })).toBe("Path");
			expect(pathKey({ env: { PATH: "value" }, platform: "win32" })).toBe("PATH");
			expect(pathKey({ env: { PaTh: "value" }, platform: "win32" })).toBe("PaTh");
		});

		test("should return the last matching env key if env has several path variants", () => {
			expect(pathKey({ env: { Path: "", PATH: "" }, platform: "win32" })).toBe("PATH");
			expect(pathKey({ env: { PATH: "", Path: "" }, platform: "win32" })).toBe("Path");
		});
	});

	describe("linux", () => {
		test.each(nonWinPlatforms)("should return `PATH` on %s regardless of the env keys", (platform) => {
			expect(pathKey({ env: { path: "value", Path: "value" }, platform })).toBe("PATH");
		});
	});
});
