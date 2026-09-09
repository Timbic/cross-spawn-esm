import type { SpawnOptions } from "node:child_process";
import type { ParsedCommand } from "./utils/resolve-command.ts";
import path from "node:path";
import { _env, cmdShimRegExp, executableRegExp, isWin } from "./utils/constants.ts";
import { escapeArgument, escapeCommand } from "./utils/escapes.ts";
import { detectShebang } from "./utils/shebang.ts";

/**
 * Prepares a parsed command for spawning without a shell.
 * On POSIX the command is returned as-is, since the native `spawn` handles it.
 * On Windows the command is resolved first: a shebang script is rewired to run
 * through its interpreter. Unless the resolved command is a plain `.exe`,
 * the command is then wrapped for `cmd.exe`: the command and arguments are
 * escaped and reassembled into a `cmd /d /s /c "..."` invocation with
 * `windowsVerbatimArguments` set. The result is a `parsed` whose `command`/`args` are directly spawnable.
 */
export function parseNonShell(parsed: ParsedCommand) {
	if (!isWin) return parsed;

	// Detect and add support for shebangs.
	// `null` means the command could not be resolved; defaulting to an empty
	// string keeps the shell fallback, so a missing command is later surfaced
	// as an `ENOENT` error instead of failing silently.
	const commandFile = detectShebang(parsed) ?? "";

	// We don't need a shell if the command filename is an executable
	const needsShell = !executableRegExp.test(commandFile);

	// If a shell is required, use cmd.exe and take care of escaping everything correctly
	if (parsed.options._forceShell ?? needsShell) {
		// Need to double escape meta chars if the command is a cmd-shim located in `node_modules/.bin/`
		// The cmd-shim simply calls execute the package bin file with NodeJS, proxying any argument
		// Because the escape of metachars with ^ gets interpreted when the cmd.exe is first called,
		// we need to double escape them
		const needsDoubleEscapeMetaChars = cmdShimRegExp.test(commandFile);

		// Normalize posix paths into OS compatible paths (e.g.: foo/bar -> foo\bar)
		// This is necessary otherwise it will always fail with ENOENT in those cases
		parsed.command = path.normalize(parsed.command);

		// Escape command & arguments
		parsed.command = escapeCommand(parsed.command);
		parsed.args = parsed.args.map((arg) => escapeArgument(arg, needsDoubleEscapeMetaChars));

		const shellCommand = [parsed.command].concat(parsed.args).join(" ");

		parsed.args = ["/d", "/s", "/c", `"${shellCommand}"`];
		parsed.command = _env.comspec ?? "cmd.exe";
		parsed.options.windowsVerbatimArguments = true; // Tell node's spawn that the arguments are already escaped
	}

	return parsed;
}

/**
 * Turns a `spawn`/`spawnSync` call signature into a `ParsedCommand`.
 * Accepts the same overload as Node: when the second argument is an options
 * object instead of an args array, it is treated as `options`. The args and
 * options are cloned so the caller's objects are never mutated, and parsing is
 * delegated to `parseNonShell` unless `options.shell` is set (in which case
 * the command is passed through untouched, like Node).
 */
export function parse(command: string, args: ReadonlyArray<string> | null, options?: SpawnOptions) {
	// Normalize arguments, similar to nodejs
	if (args && !Array.isArray(args)) {
		options = args as SpawnOptions;
		args = null;
	}

	const argsCopy: string[] = args ? args.slice(0) : []; // Clone array to avoid changing the original
	options = Object.assign({}, options); // Clone object to avoid changing the original

	// Build our parsed object.
	// `original.args` gets its own copy so it can stay genuinely readonly: later
	// rewiring (shebangs, cmd.exe wrapping) mutates `parsed.args` and must not
	// leak into the user's original arguments.
	const parsed = {
		command,
		args: argsCopy,
		options,
		file: undefined,
		original: {
			command,
			args: argsCopy.slice(0),
		},
	} as ParsedCommand;

	// Delegate further parsing to shell or non-shell
	return options.shell ? parsed : parseNonShell(parsed);
}
