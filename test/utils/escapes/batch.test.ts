import { describe, expect, test } from "vitest";
import { isBatchFile, assertSafeBatchCommand, unsafeBatchFileError, escapeBatchArgument } from "~/utils/escapes/batch";

describe.concurrent("isBatchFile", () => {
	test.each(["tool.bat", "tool.cmd", "TOOL.BAT", "tool.bat ", "tool.cmd.", "C:\\bin\\tool.BaT", "tool.bat.."])(
		"should detect %s as a batch file",
		(name) => {
			expect(isBatchFile(name)).toBe(true);
		},
	);

	test.each(["tool.exe", "tool", "tool.bat.txt", "tool.sh", ""])("should not detect %s as a batch file", (name) => {
		expect(isBatchFile(name)).toBe(false);
	});
});

describe.concurrent("assertSafeBatchCommand", () => {
	test("should accept a normal batch command", () => {
		expect(() => assertSafeBatchCommand("C:\\bin\\tool.cmd")).not.toThrow();
	});

	test.each(["tool.cmd ", "tool.cmd.", "tool.cmd.."])("should reject trailing dots/spaces in %s", (command) => {
		expect(() => assertSafeBatchCommand(command)).toThrow(/dot or a space/);
	});

	test("should reject a percent sign", () => {
		expect(() => assertSafeBatchCommand("C:\\bin\\%NAME%.cmd")).toThrow(/percent sign/);
	});

	test.each(["tool\r.cmd", "tool\n.cmd", "tool\0.cmd"])("should reject line breaks and NUL bytes", (command) => {
		expect(() => assertSafeBatchCommand(command)).toThrow(/null byte or a line break/);
	});
});

describe.concurrent("unsafeBatchFileError", () => {
	test("should expose a stable error code", () => {
		const error = unsafeBatchFileError("C:\\bin\\tool.cmd");

		expect(error).toBeInstanceOf(TypeError);
		expect(error.code).toBe("ERR_UNSAFE_BATCH_FILE");
	});
});

describe.concurrent("escapeBatchArgument", () => {
	test("should always quote the argument", () => {
		expect(escapeBatchArgument("hello")).toBe('"hello"');
		expect(escapeBatchArgument("")).toBe('""');
		expect(escapeBatchArgument("a b")).toBe('"a b"');
		expect(escapeBatchArgument(123)).toBe('"123"');
	});

	test("should double embedded double quotes", () => {
		expect(escapeBatchArgument('a"b')).toBe('"a""b"');
		expect(escapeBatchArgument('"quoted"')).toBe('"""quoted"""');
	});

	test("should double backslashes before a quote and at the end", () => {
		expect(escapeBatchArgument('a\\"b')).toBe('"a\\\\""b"');
		expect(escapeBatchArgument("a\\")).toBe('"a\\\\"');
		expect(escapeBatchArgument("C:\\Program Files\\")).toBe('"C:\\Program Files\\\\"');
	});

	test("should keep shell metacharacters inside the quotes", () => {
		expect(escapeBatchArgument("a&b|c<d>e^f(g)")).toBe('"a&b|c<d>e^f(g)"');
		expect(escapeBatchArgument('"& calc.exe')).toBe('"""& calc.exe"');
	});

	test("should reject a percent sign", () => {
		expect(() => escapeBatchArgument("100%")).toThrow(/percent sign/);
		expect(() => escapeBatchArgument("%PATH%")).toThrow(/percent sign/);
	});

	test.each(["a\rb", "a\nb", "a\0b"])("should reject line breaks and NUL bytes", (arg) => {
		expect(() => escapeBatchArgument(arg)).toThrow(/null byte or a line break/);
	});
});
