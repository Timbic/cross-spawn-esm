import type { ChildProcess, SpawnOptions, SpawnSyncOptions } from "node:child_process";
import { spawn, spawnSync } from "../../src/index";

type STD = string | Buffer | null;

const methods = ["spawn-force-shell", "spawn", "sync-force-shell", "sync"] as const;
type Methods = (typeof methods)[number];
type SyncMethods = Extract<Methods, "sync" | "sync-force-shell">;
type AsyncMethods = Exclude<Methods, SyncMethods>;

function isForceShell(method: Methods) {
	return /-force-shell$/.test(method);
}

function isMethodSync(method: Methods): method is SyncMethods {
	return /^sync(-|$)/.test(method);
}

interface RunResult {
	stdout: string | null;
	stderr: string | null;
}

interface CommandError extends Error {
	exitCode: number | null;
	stdout: string | null;
	stderr: string | null;
}

function toText(value: STD) {
	return value == null ? null : value.toString();
}

function resolveRun(exitCode: number | null, stdout: STD, stderr: STD): RunResult | CommandError {
	const result: RunResult = { stdout: toText(stdout), stderr: toText(stderr) };

	if (exitCode !== 0) {
		return Object.assign(new Error(`Command failed, exited with code #${exitCode}`), {
			exitCode,
			...result,
		});
	}

	return result;
}

function runSync(command: string, args: ReadonlyArray<string | number>, options: SpawnSyncOptions) {
	const { error, status, stdout, stderr } = spawnSync(command, args.map(String), options);

	if (error) {
		throw error;
	}

	const resolved = resolveRun(status, stdout, stderr);

	if (resolved instanceof Error) {
		throw resolved;
	}

	return resolved;
}

type RunPromise = Promise<RunResult> & { cp: ChildProcess };

function runAsync(command: string, args: ReadonlyArray<string | number>, options: SpawnOptions): RunPromise {
	const cp = spawn(command, args.map(String), options);

	const promise = new Promise<RunResult>((resolve, reject) => {
		let stdout: STD = null;
		let stderr: STD = null;

		if (cp.stdout) {
			cp.stdout.on("data", (data) => {
				stdout = stdout || Buffer.alloc(0);
				stdout = Buffer.concat([stdout, data]);
			});
		}

		if (cp.stderr) {
			cp.stderr.on("data", (data) => {
				stderr = stderr || Buffer.alloc(0);
				stderr = Buffer.concat([stderr, data]);
			});
		}

		const cleanupListeners = () => {
			cp.removeListener("error", onError);
			cp.removeListener("close", onClose);
		};

		const onError = (err: Error) => {
			cleanupListeners();
			reject(err);
		};

		const onClose = (code: number | null) => {
			cleanupListeners();

			const resolved = resolveRun(code, stdout, stderr);

			if (resolved instanceof Error) {
				reject(resolved);
			} else {
				resolve(resolved);
			}
		};

		cp.on("error", onError).on("close", onClose);
	});

	return Object.assign(promise, { cp });
}

type RunOptions = SpawnOptions & { _forceShell?: boolean };
type RunArgs = ReadonlyArray<string | number> | null | SpawnOptions;

function run(method: SyncMethods, command: string, argsOrOptions?: RunArgs, options?: SpawnSyncOptions): RunResult;
function run(method: AsyncMethods, command: string, argsOrOptions?: RunArgs, options?: SpawnOptions): RunPromise;
function run(method: Methods, command: string, argsOrOptions?: RunArgs, options?: SpawnSyncOptions): RunResult | RunPromise;
function run(method: Methods, command: string, argsOrOptions?: RunArgs, maybeOptions?: SpawnSyncOptions): RunResult | RunPromise {
	let args: ReadonlyArray<string | number> | null;
	let options: RunOptions;

	if (Array.isArray(argsOrOptions)) {
		args = argsOrOptions;
		options = maybeOptions ?? {};
	} else if (argsOrOptions !== null && argsOrOptions !== undefined) {
		args = null;
		options = argsOrOptions as SpawnOptions;
	} else {
		args = null;
		options = maybeOptions ?? {};
	}

	if (isForceShell(method)) {
		method = method.replace(/-force-shell$/, "") as Methods;
		options = { _forceShell: true, ...options };
	}

	return isMethodSync(method) ? runSync(command, args ?? [], options) : runAsync(command, args ?? [], options);
}

export { run, methods, isMethodSync, isForceShell };
