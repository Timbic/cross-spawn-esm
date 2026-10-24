import { parentPort } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import { spawnSync } from "../../dist/index.js";

// `test/` — relative commands below are resolved against this directory.
const cwd = fileURLToPath(new URL("..", import.meta.url));

let chdirError = null;
try {
	process.chdir(cwd);
} catch (error) {
	chdirError = error.message;
}

const result = spawnSync("./fixtures/shebang", [], { cwd });

parentPort.postMessage({
	chdirError,
	status: result.status,
	error: result.error && result.error.code,
	stdout: result.stdout && result.stdout.toString(),
});
