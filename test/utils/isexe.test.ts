import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi, type MockInstance } from "vitest";
import { isExecutableMode, isInPathExt, isexeSync } from "~/utils/isexe.ts";
import { _env, isWin } from "~/utils/constants.ts";

function pathExt(...extensions: Array<string>) {
	return extensions.join(path.delimiter);
}

describe.concurrent("isInPathExt", () => {
	test("should return `true` if the file extension is listed", () => {
		expect(isInPathExt("foo.exe", pathExt(".EXE", ".CMD", ".BAT"))).toBe(true);
		expect(isInPathExt("foo.CMD", pathExt(".EXE", ".CMD", ".BAT"))).toBe(true);
	});

	test("should match the extension case-insensitively", () => {
		expect(isInPathExt("foo.EXE", ".exe")).toBe(true);
		expect(isInPathExt("foo.exe", ".ExE")).toBe(true);
	});

	test("should return `false` if the file extension is not listed", () => {
		expect(isInPathExt("foo.txt", pathExt(".EXE", ".CMD"))).toBe(false);
		expect(isInPathExt("foo", pathExt(".EXE", ".CMD"))).toBe(false);
		expect(isInPathExt("a", ".exe")).toBe(false);
	});

	test("should match the file suffix only", () => {
		expect(isInPathExt("foo.exe.bak", ".exe")).toBe(false);
		expect(isInPathExt("foo.exe.bak", ".bak")).toBe(true);
	});

	test("should treat every file as executable if the list has an empty entry", () => {
		expect(isInPathExt("foo.txt", pathExt(".EXE", ""))).toBe(true);
		expect(isInPathExt("foo.txt", pathExt("", ".EXE"))).toBe(true);
		expect(isInPathExt("foo", "")).toBe(true);
	});

	test("should match a list entry without a leading dot as a plain suffix", () => {
		expect(isInPathExt("notexe", "EXE")).toBe(true);
		expect(isInPathExt("exe", "exe")).toBe(true);
		expect(isInPathExt("foo.exe", "CMD")).toBe(false);
	});

	describe.runIf(isWin && _env.PATHEXT)("windows", () => {
		const realPathExt = _env.PATHEXT!;

		test("should match the extension case-insensitively", () => {
			expect(isInPathExt("foo.EXE", ".exe")).toBe(true);
			expect(isInPathExt("foo.exe", ".ExE")).toBe(true);
		});

		test("should match the file suffix only", () => {
			expect(isInPathExt("foo.plz.exe", realPathExt)).toBe(true);
			expect(isInPathExt("foo.exe.plz", realPathExt)).toBe(false);
		});
	});
});

describe.runIf(!isWin)("isExecutableMode", () => {
	const myUid = 1000;
	const myGid = 1000;
	const myGroups = [1000, 2000];
	let getuid: MockInstance<() => number>;

	function stat(mode: number, uid = myUid, gid = myGid) {
		return { mode, uid, gid } as fs.Stats;
	}

	function noGid() {
		return vi.spyOn(process, "getgid").mockReturnValue(undefined as unknown as number);
	}

	beforeEach(() => {
		getuid = vi.spyOn(process, "getuid").mockReturnValue(myUid);
		vi.spyOn(process, "getgid").mockReturnValue(myGid);
		vi.spyOn(process, "getgroups").mockReturnValue(myGroups);
	});

	afterEach(() => vi.restoreAllMocks());

	test("should return `true` if the file is executable by its owner", () => {
		expect(isExecutableMode(stat(0o755))).toBe(true);
		expect(isExecutableMode(stat(0o700))).toBe(true);
	});

	test("should return `true` if the file is executable by the current group", () => {
		expect(isExecutableMode(stat(0o750, myUid, 2000))).toBe(true);
	});

	test("should return `true` if the file is executable by others", () => {
		expect(isExecutableMode(stat(0o701, 999, 999))).toBe(true);
	});

	test("should return `true` for root if the file is executable by its owner or group", () => {
		getuid.mockReturnValue(0);

		expect(isExecutableMode(stat(0o770, myUid, 3000))).toBe(true);
	});

	test("should return `true` for root if only the group execute bit is set", () => {
		getuid.mockReturnValue(0);

		expect(isExecutableMode(stat(0o010, myUid, 3000))).toBe(true);
	});

	test("should return `true` if only the other execute bit is set, even for the owner", () => {
		expect(isExecutableMode(stat(0o001))).toBe(true);
	});

	test("should return `false` if the file is only executable by another owner", () => {
		expect(isExecutableMode(stat(0o700, 999))).toBe(false);
	});

	test("should return `false` if the file is only executable by another group", () => {
		expect(isExecutableMode(stat(0o070, myUid, 3000))).toBe(false);
	});

	test("should return `false` if no execute bit is set", () => {
		for (const mode of [0o000, 0o444, 0o640, 0o644, 0o666]) {
			expect(isExecutableMode(stat(mode))).toBe(false);
		}
	});

	test("should fall back to the first group id if the gid is unavailable", () => {
		noGid();
		vi.spyOn(process, "getgroups").mockReturnValue([2000]);

		expect(isExecutableMode(stat(0o010, myUid, 2000))).toBe(true);
	});

	test("should throw if neither the uid nor the gid is available", () => {
		getuid.mockReturnValue(undefined as unknown as number);
		noGid();
		vi.spyOn(process, "getgroups").mockReturnValue([]);

		expect(() => isExecutableMode(stat(0o755))).toThrow("cannot get uid or gid");
	});
});

describe.concurrent("isexeSync", () => {
	let dir: string;

	function file(name: string) {
		return path.join(dir, name);
	}

	beforeAll(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), "cross-spawn-esm-isexe-"));

		fs.mkdirSync(file("subdir"));
	});

	afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

	test("should return `false` if the file does not exist", () => {
		expect(isexeSync(file("missing"))).toBe(false);
	});

	test("should return `false` if the path is not a file", () => {
		expect(isexeSync(file("subdir"))).toBe(false);
	});

	describe.runIf(isWin)("windows", () => {
		beforeAll(() => {
			for (const name of ["exec.exe", "noexec.txt", "script.cmd"]) {
				fs.writeFileSync(file(name), "");
			}
		});

		test("should check the file extension against pathExt", () => {
			expect(isexeSync(file("exec.exe"), { pathExt: pathExt(".EXE") })).toBe(true);
			expect(isexeSync(file("noexec.txt"), { pathExt: pathExt(".EXE") })).toBe(false);
		});

		test("should match any entry in a multi-entry pathExt", () => {
			expect(isexeSync(file("script.cmd"), { pathExt: pathExt(".EXE", ".CMD") })).toBe(true);
		});

		test.skipIf(!_env.PATHEXT)("should use the process PATHEXT by default", () => {
			expect(isexeSync(file("exec.exe"))).toBe(true);
			expect(isexeSync(file("noexec.txt"))).toBe(false);
		});
	});

	describe.runIf(!isWin)("linux", () => {
		beforeAll(() => {
			fs.writeFileSync(file("exec"), "");
			fs.chmodSync(file("exec"), 0o755);

			fs.writeFileSync(file("noexec"), "");
			fs.chmodSync(file("noexec"), 0o644);

			fs.symlinkSync(file("exec"), file("exec-link"));
			fs.symlinkSync(file("missing-target"), file("broken-link"));
		});

		test("should check the file mode", () => {
			expect(isexeSync(file("exec"))).toBe(true);
			expect(isexeSync(file("noexec"))).toBe(false);
		});

		test("should follow symlinks to the target file", () => {
			expect(isexeSync(file("exec-link"))).toBe(true);
		});

		test("should return `false` if the symlink target does not exist", () => {
			expect(isexeSync(file("broken-link"))).toBe(false);
		});
	});
});
