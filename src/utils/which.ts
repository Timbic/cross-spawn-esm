import path from "node:path";
import { _cwd, _env, isWin } from "./constants";
import { isexeSync } from "./isexe";

type WhichOptions = {
	cwd?: string;
	path?: string;
	pathExt?: string;
};

// Matches a command containing a path separator (`/` or, on Windows, `\`).
// Such a command refers to a file path directly, so `PATH` is not searched.
const pathSeparatorRegExp = new RegExp(`[${path.posix.sep}${path.sep === path.posix.sep ? "" : path.sep}]`.replace(/(\\)/g, "\\$1"));

/**
 * Resolve `command` to an absolute executable path by searching `PATH` (the
 * current directory first on Windows). Commands containing a path separator are
 * checked as given instead of searched. Returns `null` when nothing matches.
 */
export function whichSync(
	command: string,
	{ cwd = _cwd, path: optPath = _env.PATH, pathExt: optPathExt = _env.PATHEXT }: WhichOptions = {},
) {
	const delimiter = path.delimiter;

	// Locations to look in: the command itself when it is a path, otherwise each
	// `PATH` entry (searching the current directory first on Windows).
	const dirs = command.match(pathSeparatorRegExp) ? [""] : [...(isWin ? [cwd] : []), ...(optPath ?? "").split(delimiter)];

	// Suffixes to try per location. On Windows the `PATHEXT` extensions are tried
	// (both cases), plus the bare name first when the command already has an
	// extension; elsewhere only the exact name is checked.
	const pathExtExe = isWin ? (optPathExt ?? [".EXE", ".CMD", ".BAT", ".COM"].join(delimiter)) : undefined;
	const extensions = pathExtExe?.split(delimiter).flatMap((ext) => [ext, ext.toLowerCase()]) ?? [""];

	if (isWin && command.includes(".") && extensions[0] !== "") {
		extensions.unshift("");
	}

	for (const dir of dirs) {
		const base = path.resolve(cwd, dir === "" ? command : path.join(dir.replace(/^"(.*)"$/, "$1"), command));

		for (const ext of extensions) {
			const candidate = base + ext;
			if (isexeSync(candidate, { pathExt: pathExtExe })) {
				return candidate;
			}
		}
	}

	return null;
}
