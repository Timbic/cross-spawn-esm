/**
 * How Windows batch files (`.bat`/`.cmd`) are handled.
 *
 * - `"legacy"` (default): previous caret-based behavior; not safe for untrusted input.
 * - `"strict"`: quote-based escaping with `cmd /d /e:on /v:off /s /c`; rejects
 *   `%`, NUL, CR, and LF. Protects `%*`, but not `%~1`.
 * - `"reject"`: mirror Node's behavior.
 */
export type BatchMode = "legacy" | "strict" | "reject";

export interface BatchOptions {
	/**
	 * Controls how Windows batch files (`.bat`/`.cmd`) are handled. Only applies on
	 * Windows with `shell` disabled. Unknown runtime values fall back to `"legacy"`.
	 *
	 * @default "legacy"
	 */
	batchMode?: BatchMode;
}
