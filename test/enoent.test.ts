import type { ChildProcess } from "node:child_process";
import { describe, expect, test } from "vitest";
import { isWin } from "~/utils/constants.ts";
import { hookChildProcess, notFoundError, verifyENOENT, type SpawnError } from "~/enoent.ts";
import { parsedCommand } from "./utils/helpers";

function createChildProcess() {
	const events: Array<{ name: string | symbol; args: Array<unknown> }> = [];

	const cp = {
		emit(name: string | symbol, ...args: Array<unknown>) {
			events.push({ name, args });
			return true;
		},
	} as ChildProcess;

	return { cp, events };
}

describe.concurrent("notFoundError", () => {
	test("should build a spawn ENOENT error", () => {
		const original = { command: "no-such-tool", args: ["a", "b"] };
		const error = notFoundError(original, "spawn");

		expect(error).toBeInstanceOf(Error);
		expect(error.message).toBe("spawn no-such-tool ENOENT");
		expect(error.code).toBe("ENOENT");
		expect(error.errno).toBe(-2);
		expect(error.syscall).toBe("spawn no-such-tool");
		expect(error.path).toBe("no-such-tool");
		expect(error.spawnargs).toBe(original.args);
	});

	test("should build a spawnSync ENOENT error", () => {
		const original = { command: "missing", args: [] };
		const error = notFoundError(original, "spawnSync");

		expect(error.message).toBe("spawnSync missing ENOENT");
		expect(error.syscall).toBe("spawnSync missing");
		expect(error.path).toBe("missing");
		expect(error.spawnargs).toEqual([]);
	});
});

describe.concurrent("verifyENOENT", () => {
	describe.runIf(isWin)("windows", () => {
		const parsed = parsedCommand("no-such-tool");

		test("should surface exit code 1 with an unresolved command as ENOENT", () => {
			const error = verifyENOENT(1, parsed, "spawn");

			expect(error).not.toBeNull();
			expect(error!.code).toBe("ENOENT");
			expect(error!.message).toBe("spawn no-such-tool ENOENT");
			expect(error!.spawnargs).toEqual([]);
		});

		test("should use the given syscall for spawnSync", () => {
			const error = verifyENOENT(1, parsed, "spawnSync");

			expect(error!.syscall).toBe("spawnSync no-such-tool");
			expect(error!.message).toBe("spawnSync no-such-tool ENOENT");
		});

		test("should not flag exit code 1 when the command file was resolved", () => {
			expect(verifyENOENT(1, { ...parsed, file: "C:\\bin\\tool.cmd" }, "spawn")).toBeNull();
		});

		test("should ignore other exit codes and a `null` status", () => {
			expect(verifyENOENT(0, parsed, "spawn")).toBeNull();
			expect(verifyENOENT(2, parsed, "spawn")).toBeNull();
			expect(verifyENOENT(null, parsed, "spawn")).toBeNull();
		});
	});

	describe.runIf(!isWin)("linux", () => {
		test("should never flag exit code 1", () => {
			expect(verifyENOENT(1, parsedCommand("no-such-tool"), "spawn")).toBeNull();
			expect(verifyENOENT(1, parsedCommand("no-such-tool"), "spawnSync")).toBeNull();
		});
	});
});

describe.concurrent("hookChildProcess", () => {
	describe.runIf(isWin)("windows", () => {
		test("should turn exit code 1 with an unresolved command into an error event", () => {
			const { cp, events } = createChildProcess();

			hookChildProcess(cp, parsedCommand("no-such-tool"));
			cp.emit("exit", 1);

			expect(events).toHaveLength(1);
			expect(events[0]!.name).toBe("error");

			const error = events[0]!.args[0] as SpawnError;
			expect(error.message).toBe("spawn no-such-tool ENOENT");
			expect(error.code).toBe("ENOENT");
			expect(error.syscall).toBe("spawn no-such-tool");
		});

		test("should forward exit codes other than 1", () => {
			const { cp, events } = createChildProcess();

			hookChildProcess(cp, parsedCommand("no-such-tool"));

			expect(cp.emit("exit", 0)).toBe(true);
			expect(events).toEqual([{ name: "exit", args: [0] }]);
		});

		test("should forward exit code 1 when the command file was resolved", () => {
			const { cp, events } = createChildProcess();

			hookChildProcess(cp, { ...parsedCommand("tool"), file: "C:\\bin\\tool.cmd" });
			cp.emit("exit", 1);

			expect(events).toEqual([{ name: "exit", args: [1] }]);
		});

		test("should forward events other than `exit`", () => {
			const { cp, events } = createChildProcess();

			hookChildProcess(cp, parsedCommand("no-such-tool"));
			cp.emit("spawn");

			expect(events).toEqual([{ name: "spawn", args: [] }]);
		});
	});

	describe.runIf(!isWin)("linux", () => {
		test("should leave `emit` untouched", () => {
			const { cp } = createChildProcess();
			const originalEmit = cp.emit;

			hookChildProcess(cp, parsedCommand("no-such-tool"));

			expect(cp.emit).toBe(originalEmit);
		});
	});
});
