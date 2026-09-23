import path from "node:path";
import fs from "node:fs";
import { _env, isWin } from "./constants";

// Executable mode bits: owner/group/other execute, plus owner-or-group
const execOther = 0o001;
const execGroup = 0o010;
const execOwner = 0o100;
const execOwnerOrGroup = execOwner | execGroup;

/**
 * Whether the file's extension appears in the `PATHEXT` executable list. An
 * empty entry (e.g. a trailing separator) makes every file acceptable.
 */
function isInPathExt(file: string, pathExt: string) {
	const extensions = pathExt.split(path.delimiter);
	if (extensions.includes("")) return true;

	return extensions.some((ext) => {
		const e = ext.toLowerCase();
		return e !== "" && file.slice(-e.length).toLowerCase() === e;
	});
}

/**
 * Whether the file mode marks the file as executable for the current user,
 * mirroring libuv's `access(X_OK)` semantics.
 */
function isExecutableMode(stat: fs.Stats) {
	const myUid = process.getuid?.();
	const myGroups = process.getgroups?.() ?? [];
	const myGid = process.getgid?.() ?? myGroups[0];
	if (myUid === undefined || myGid === undefined) {
		throw new Error("cannot get uid or gid");
	}

	const groups = new Set([myGid, ...myGroups]);
	const { mode, uid, gid } = stat;

	return !!(
		mode & execOther ||
		(mode & execGroup && groups.has(gid)) ||
		(mode & execOwner && uid === myUid) ||
		(mode & execOwnerOrGroup && myUid === 0)
	);
}

/**
 * Determine whether a file is executable: on Windows through its `PATHEXT`
 * extension, on POSIX through its mode bits. Missing or unreadable files are
 * not executable.
 */
export function isexeSync(file: string, { pathExt = _env.PATHEXT ?? "" } = {}) {
	try {
		const stat = fs.statSync(file);
		if (!stat.isFile()) return false;
		return isWin ? isInPathExt(file, pathExt) : isExecutableMode(stat);
	} catch {
		return false;
	}
}
