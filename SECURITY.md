# Security

## Windows batch files

### What the package does

On Windows, commands that resolve to a `.bat` or `.cmd` file are parsed by `cmd.exe` a second time. The package therefore:

- detects batch files after stripping trailing dots and spaces (CVE-2024-36138),
- always quotes batch arguments, doubles embedded quotes (`"` -> `""`), and doubles backslashes before quotes and at the end,
- rejects `%`, NUL, CR, and LF in batch arguments and batch command names,
- forces `cmd /d /e:on /v:off /s /c`,
- sets `windowsVerbatimArguments` so the command line is passed through unchanged.

`%` is rejected because `cmd.exe` expands it before any escaping can take effect. It cannot be escaped reliably, especially across nested
batch files. NUL and line breaks terminate the command line.

### What this protects

This protects batch files that forward their arguments, such as npm-style shims:

```bat
@echo off
node "%~dp0\cli.js" %*
```

The quotes added by the package survive `%*`, so arguments such as `&`, `|`, `<`, `>`, `^`, `"`, spaces, and Unicode arrive as a single
argument.

### What this does not protect

The package cannot protect:

- batch files that strip quotes and then use the value unquoted (`%~1`),
- batch files that use an argument as the command itself,
- batch files that are themselves untrusted,
- argument injection where the target program interprets a value as an option or path,
- `shell: true`, which bypasses the package's escaping entirely.

## `%~1` batch files

This is the important residual risk.

```bat
@echo off
echo %~1
```

The package passes `"& calc"`. `%~1` removes the quotes, the line becomes `echo & calc`, and `cmd.exe` runs `calc`.

Caller-side escaping cannot fix this for every batch file:

- caret escaping (`^&`) changes the value and is unreliable; for example, it does not protect `>` redirection,
- adding quotes is exactly what `%~1` removes,
- nested batch files consume carets at different rates.

### If you control the batch file

- Forward arguments with `%*` instead of `%~1` when possible.
- Quote every use: `"%~1"` rather than `%~1`.
- Never use `%~1` as the command itself.
- Prefer a native executable or a Node.js script over a batch file.

### If you do not control the batch file

Do not pass untrusted values to it. If you must, validate and reject; do not strip or "clean" characters.

A conservative allowlist for identifiers, versions, and simple names:

```ts
const SAFE_BATCH_VALUE = /^[A-Za-z0-9._-]+$/;

function assertSafeBatchValue(value: string) {
	if (!SAFE_BATCH_VALUE.test(value)) {
		throw new TypeError(`Unsafe batch argument: ${JSON.stringify(value)}`);
	}
	return value;
}
```

For paths, use a separate policy and validate the resolved path:

```ts
// Only if the batch quotes the value: "%~1"
const SAFE_BATCH_PATH = /^[A-Za-z0-9._\\:/ -]+$/;
```

This still allows `..`, drive-relative paths, and option-like values. Validate traversal and argument semantics separately. An allowlist
prevents command injection, not argument injection.

If the value is arbitrary text, encode it instead of escaping it:

```ts
// Safe in every cmd.exe context: [A-Za-z0-9_-]
const encoded = Buffer.from(value, "utf8").toString("base64url");
```

Pass the encoded string and decode it inside the batch or a helper program. Hex (`[0-9A-Fa-f]+`) works too. Alternatively, write the value
to a temporary file and pass the temporary file path.

Do not rely on a denylist such as `value.replace(/[&|<>^]/g, "")`. `cmd.exe` has too many context-dependent rules, and silently changing the
value can create new bugs.

## `shell: true`

`shell: true` bypasses this package's escaping. `parse()` returns the command untouched, and Node.js concatenates the command and arguments
into a single string for the shell:

- Windows: `cmd.exe /d /s /c "..."` (or the configured `ComSpec`),
- POSIX: `/bin/sh -c "..."` (or `options.shell`).

Node.js does not quote individual arguments. The `DEP0190` warning is emitted for this reason.

It is safe only when the entire command line and the environment that resolves and executes it are trusted and shell-safe. Even without
direct user input, the shell still interprets:

- shell metacharacters in trusted strings (`&`, `|`, `<`, `>`, `^`, `"`, `$`, backticks, `%`, spaces),
- environment expansion (`%VAR%` on Windows, `$VAR`/`$(...)` on POSIX),
- command resolution through `PATH` and the current directory (Windows searches the current directory first),
- the selected shell and its startup configuration (`ComSpec`, `options.shell`, `BASH_ENV`, `ENV`),
- batch files, because the package's batch protection is bypassed.

Prefer `shell: false`. Use `shell: true` only when you need shell features or a builtin, with a fixed and shell-safe command string. Never
pass `options.env`, `options.cwd`, or `options.shell` from untrusted input.

## Related CVEs

- CVE-2024-27980: Windows batch file argument injection (`BatBadBut`).
- CVE-2024-36138: incomplete fix; batch detection bypass via trailing characters.
