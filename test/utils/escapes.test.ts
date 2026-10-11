import { describe, expect, test } from "vitest";
import { escapeArgument, escapeCommand, escapeLineBreaks, escapeMetaChars } from "~/utils/escapes.ts";

describe.concurrent("escapeLineBreaks", () => {
	test("should strip carriage returns and new lines", () => {
		expect(escapeLineBreaks("console.log('ok')\ncalc.exe")).toBe("console.log('ok')calc.exe");
		expect(escapeLineBreaks("foo\r\nbar\rbaz")).toBe("foobarbaz");
	});

	test("should leave strings without line breaks untouched", () => {
		expect(escapeLineBreaks("no breaks here")).toBe("no breaks here");
		expect(escapeLineBreaks("")).toBe("");
	});
});

describe.concurrent("escapeMetaChars", () => {
	test("should prefix every cmd.exe meta character with a caret", () => {
		for (const char of '()[]%!^"`<>&|;, *?') {
			expect(escapeMetaChars(char)).toBe(`^${char}`);
		}
	});

	test("should leave non-meta characters untouched", () => {
		expect(escapeMetaChars("plain-123_.exe")).toBe("plain-123_.exe");
		expect(escapeMetaChars("a\\b")).toBe("a\\b");
		expect(escapeMetaChars("")).toBe("");
	});

	test("should escape a whole command line", () => {
		expect(escapeMetaChars('notepad "a & b.txt"')).toBe('notepad^ ^"a^ ^&^ b.txt^"');
	});
});

describe.concurrent("escapeCommand", () => {
	test("should escape meta characters in the command", () => {
		expect(escapeCommand('notepad "a & b.txt"')).toBe('notepad^ ^"a^ ^&^ b.txt^"');
		expect(escapeCommand("a\\b")).toBe("a\\b");
	});

	test("should strip line breaks before escaping", () => {
		expect(escapeCommand("echo hi\ncalc.exe")).toBe("echo^ hicalc.exe");
	});

	test("should leave a clean command untouched", () => {
		expect(escapeCommand("plain.exe")).toBe("plain.exe");
	});
});

describe.concurrent("escapeArgument", () => {
	test("should quote the argument and escape the quotes", () => {
		expect(escapeArgument("hello")).toBe('^"hello^"');
		expect(escapeArgument("")).toBe('^"^"');
	});

	test("should escape spaces inside the argument", () => {
		expect(escapeArgument("a b")).toBe('^"a^ b^"');
		expect(escapeArgument("a  b")).toBe('^"a^ ^ b^"');
	});

	test("should coerce non-string arguments to strings", () => {
		expect(escapeArgument(123)).toBe('^"123^"');
		expect(escapeArgument(null)).toBe('^"null^"');
		expect(escapeArgument(undefined)).toBe('^"undefined^"');
	});

	test("should not treat backslashes as meta characters", () => {
		expect(escapeArgument("a\\b")).toBe('^"a\\b^"');
	});

	test("should double trailing backslashes before the closing quote", () => {
		expect(escapeArgument("a\\")).toBe('^"a\\\\^"');
	});

	test("should double backslashes before an inner double quote", () => {
		expect(escapeArgument('a\\"b')).toBe('^"a\\\\\\^"b^"');
	});

	test("should escape an inner double quote with no preceding backslashes", () => {
		expect(escapeArgument('a"b')).toBe('^"a\\^"b^"');
	});

	test("should double escape meta characters when requested", () => {
		expect(escapeArgument("a b", true)).toBe('^^^"a^^^ b^^^"');
	});
});
