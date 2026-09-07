import type { SpawnOptions } from "node:child_process";
import type { ParsedCommand } from "./utils/resolve-command.ts";
import path from "node:path";
import { cmdShimRegExp, executableRegExp, isWin } from "./utils/constants.ts";
import { escapeArgument, escapeCommand } from "./utils/escapes.ts";
import { detectShebang } from "./utils/shebang.ts";

export function parseNonShell(parsed: ParsedCommand) {
	if (!isWin) return parsed;

	// Detect & add support for shebangs
	const commandFile = detectShebang(parsed);

	// We don't need a shell if the command filename is an executable
	const needsShell = !executableRegExp.test(commandFile!);

	// If a shell is required, use cmd.exe and take care of escaping everything correctly
	// Note that `forceShell` is an hidden option used only in tests
	if (parsed.options._forceShell ?? needsShell) {
		// Need to double escape meta chars if the command is a cmd-shim located in `node_modules/.bin/`
		// The cmd-shim simply calls execute the package bin file with NodeJS, proxying any argument
		// Because the escape of metachars with ^ gets interpreted when the cmd.exe is first called,
		// we need to double escape them
		const needsDoubleEscapeMetaChars = cmdShimRegExp.test(commandFile!);

		// Normalize posix paths into OS compatible paths (e.g.: foo/bar -> foo\bar)
		// This is necessary otherwise it will always fail with ENOENT in those cases
		parsed.command = path.normalize(parsed.command);

		// Escape command & arguments
		parsed.command = escapeCommand(parsed.command);
		parsed.args = parsed.args.map((arg) => escapeArgument(arg, needsDoubleEscapeMetaChars));

		const shellCommand = [parsed.command].concat(parsed.args).join(" ");

		parsed.args = ["/d", "/s", "/c", `"${shellCommand}"`];
		parsed.command = process.env.comspec ?? "cmd.exe";
		parsed.options.windowsVerbatimArguments = true; // Tell node's spawn that the arguments are already escaped
	}

	return parsed;
}

export function parse(command: string, args: ReadonlyArray<string> | null, options?: SpawnOptions) {
	// Normalize arguments, similar to nodejs
	if (args && !Array.isArray(args)) {
		options = args as SpawnOptions;
		args = null;
	}

	args = args ? args.slice(0) : []; // Clone array to avoid changing the original
	options = Object.assign({}, options); // Clone object to avoid changing the original

	// Build our parsed object
	const parsed = {
		command,
		args,
		options,
		file: undefined,
		original: {
			command,
			args,
		},
	} as ParsedCommand;

	// Delegate further parsing to shell or non-shell
	return options.shell ? parsed : parseNonShell(parsed);
}
