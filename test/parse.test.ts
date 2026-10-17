import { describe, test } from "vitest";

// Note to future me: there are no tests here yet because `parse` mutates its
// `parsed` argument and reads `process.env` at call time, so it needs a bit of
// scaffolding before it can be covered properly. When you get around to it,
// the case that prompted this file is:
//
//     it("falls back to cmd.exe when COMSPEC is empty (windows)", () => {
//         const original = process.env.comspec;
//         process.env.comspec = "";
//         try {
//             const parsed = _parse.parse("echo", ["hi"], {});
//             expect(parsed.command).toBe("cmd.exe");
//         } finally {
//             process.env.comspec = original;
//         }
//     });
//
// See `parseNonShell` in `src/parse.ts`: on Windows, when the resolved
// command is not a plain `.exe`, `parsed.command` is rewritten to
// `COMSPEC || "cmd.exe"` so an empty `COMSPEC` still falls back to
// `cmd.exe` instead of producing a `""` command that fails to spawn.

describe("parse", () => {
	test.todo("empty COMSPEC falls back to cmd.exe on windows");
});
