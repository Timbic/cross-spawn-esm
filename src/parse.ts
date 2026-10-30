import path from "node:path";
import type { CrossSpawnOptions, ParsedCommand } from "./utils/types.ts";
import { _env, isWin } from "./utils/constants.ts";
import { detectShebang } from "./utils/shebang.ts";
import { escapeArgument, escapeCommand } from "./utils/escapes/index.ts";
import { assertSafeBatchCommand, escapeBatchArgument, isBatchFile, unsafeBatchFileError } from "./utils/escapes/batch.ts";

// To match .exe and .com files
const executableRegExp = /\.(?:com|exe)$/i;

// To match .cmd files inside node_modules .bin
const cmdShimRegExp = /node_modules[\\/].bin[\\/][^\\/]+\.cmd$/i;

/**
 * Prepares a parsed command for spawning without a shell.
 * On POSIX the command is returned as-is, since the native `spawn` handles it.
 * On Windows the command is resolved first and a shebang script is rewired to
 * run through its interpreter. Unless the resolved command is a `.exe` or
 * `.com`, it is wrapped for `cmd.exe` with `windowsVerbatimArguments` set.
 * Batch files are handled according to `options.batchMode`: `"strict"` uses
 * quote-based escaping and `cmd /d /e:on /v:off /s /c`; `"legacy"` uses caret
 * escaping and `cmd /d /s /c`; `"reject"` throws.
 *
 * The result is a `parsed` whose `command`/`args` are directly spawnable.
 */
export function parseNonShell(parsed: ParsedCommand) {
	if (!isWin) return parsed;

	// Detect and add support for shebangs.
	// `null` means the command could not be resolved; defaulting to an empty
	// string keeps the shell fallback, so a missing command is later surfaced
	// as an `ENOENT` error instead of failing silently.
	const commandBeforeShebang = parsed.command;
	const commandFile = detectShebang(parsed) ?? "";
	const commandWasRewired = parsed.command !== commandBeforeShebang;

	// We don't need a shell if the command filename is an executable
	const needsShell = !executableRegExp.test(commandFile);

	// If a shell is required, use cmd.exe and take care of escaping everything correctly
	if (parsed.options._forceShell ?? needsShell) {
		// Normalize posix paths into OS compatible paths (e.g.: foo/bar -> foo\bar)
		// This is necessary otherwise it will always fail with ENOENT in those cases
		parsed.command = path.normalize(parsed.command);

		const batchMode = parsed.options.batchMode ?? "legacy";
		if (batchMode !== "legacy" && batchMode !== "strict" && batchMode !== "reject") {
			throw new TypeError(`Invalid batchMode: ${JSON.stringify(batchMode)}. Expected "legacy", "strict", or "reject".`);
		}

		const batchCommand =
			batchMode === "legacy" ? null : isBatchFile(commandFile) || isBatchFile(parsed.command) ? commandFile || parsed.command : null;

		if (batchCommand && batchMode === "reject") {
			throw unsafeBatchFileError(batchCommand, "spawn", parsed.original.args);
		}

		if (batchCommand && batchMode === "strict") {
			// `%` is expanded before any escaping can take effect and cannot be
			// escaped reliably, so reject it rather than risk injection.
			assertSafeBatchCommand(batchCommand);

			const shellCommand = [escapeBatchArgument(batchCommand)].concat(parsed.args.map((arg) => escapeBatchArgument(arg))).join(" ");

			// Force command extensions on, delayed expansion off, and the
			// "strip the outer quotes" parsing mode. `windowsVerbatimArguments`
			// then passes this string to cmd.exe untouched.
			parsed.args = ["/d", "/e:on", "/v:off", "/s", "/c", `"${shellCommand}"`];
		} else {
			// Need to double escape meta chars if the command is a cmd-shim located in `node_modules/.bin/`
			// The cmd-shim simply calls execute the package bin file with NodeJS, proxying any argument
			// Because the escape of metachars with ^ gets interpreted when the cmd.exe is first called,
			// we need to double escape them
			const needsDoubleEscapeMetaChars = cmdShimRegExp.test(commandFile);

			// Escape command & arguments.
			// A command whose path contains whitespace must be quoted as a whole:
			// `cmd.exe` resolves the executable before applying caret escapes, so
			// caret-escaping the space (as `escapeCommand` does) makes it split the
			// path and run only the part before the space.
			if (!commandWasRewired && /\s/.test(parsed.original.command)) {
				parsed.command = escapeArgument(parsed.original.command, needsDoubleEscapeMetaChars);
			} else {
				parsed.command = escapeCommand(parsed.command);
			}
			parsed.args = parsed.args.map((arg) => escapeArgument(arg, needsDoubleEscapeMetaChars));

			const shellCommand = [parsed.command].concat(parsed.args).join(" ");

			parsed.args = ["/d", "/s", "/c", `"${shellCommand}"`];
		}

		parsed.command = _env.comspec || "cmd.exe";
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
export function parse(command: string, args: ReadonlyArray<string> | CrossSpawnOptions, options: CrossSpawnOptions) {
	// Normalize arguments, similar to nodejs
	if (args && !Array.isArray(args)) {
		options = args as CrossSpawnOptions;
		args = [];
	}

	const argsCopy: string[] = args ? (args as ReadonlyArray<string>).slice(0) : []; // Clone array to avoid changing the original
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
