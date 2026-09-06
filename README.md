# cross-spawn-esm

> **Note:** This package is still in development and not recommended for production use yet. However, testing it in your projects is greatly
> appreciated. If you find any errors, please open an issue - PRs are also welcomed!

This is a "fork" of [cross-spawn](https://www.npmjs.com/package/cross-spawn?activeTab=readme) ( a cross-platform solution to node's spawn
and spawnSync ) which ports its codebase to modern ESM and TypeScript.

This package isn't a 100% drop-in replacement for **cross-spawn** ( the API differs slightly ) but it tries to mimic almost everything from
the original package. Please refer to the [Migration guide](#migration-guide) for further explanation.

## Installation

With NPM:

```bash
npm install cross-spawn-esm
```

With Yarn:

```bash
yarn add cross-spawn-esm
```

With PNPM:

```bash
pnpm add cross-spawn-esm
```

With Bun:

```bash
bun add cross-spawn-esm
```

With Deno:

```bash
deno add cross-spawn-esm
```

## Usage

Use it exactly the same way as node's `spawn` and `spawnSync` ( a drop-in replacement for them ) with the same arguments and options. There
is **no default export**; always use named imports.

```ts
import { spawn, spawnSync } from "cross-spawn-esm";

// Spawn NPM asynchronously
const child = spawn("npm", ["list", "-g", "-depth", "0"], { stdio: "inherit" });

// Spawn NPM synchronously
const result = spawnSync("npm", ["list", "-g", "-depth", "0"], { stdio: "inherit" });
```

## Benefits

- Overall smaller bundle size
- Tree-shaking friendly
- Fewer dependencies
- No need for an additional types package (`@types/cross-spawn`)
- Modern codebase and active maintenance
- Better documentation

## Migration guide

Porting from `cross-spawn` to `cross-spawn-esm` is mostly a matter of changing how you import the package and how you call its sync API.

### 1. Install

Uninstall `cross-spawn` (and `@types/cross-spawn` if you had it) and install `cross-spawn-esm`:

```bash
npm remove cross-spawn @types/cross-spawn
npm install cross-spawn-esm
```

### 2. Update imports & sync calls

**Before**:

```js
import spawn from "cross-spawn";

const child = spawn("npm", ["list", "-g", "-depth", "0"], { stdio: "inherit" });
const result = spawn.sync("npm", ["list", "-g", "-depth", "0"], { stdio: "inherit" });
```

**After**:

```ts
import { spawn, spawnSync } from "cross-spawn-esm";

const child = spawn("npm", ["list", "-g", "-depth", "0"], { stdio: "inherit" });
const result = spawnSync("npm", ["list", "-g", "-depth", "0"], { stdio: "inherit" });
```

### 3. Internal utilities

If you were relying on the hidden internals:

**Before**: `spawn._parse(...)`, `spawn._enoent.verifyENOENT(...)`

**After**:

```ts
import { _parse, _enoent } from "cross-spawn-esm";
```

Note: `_enoent.verifyENOENT(status, parsed, syscall)` now takes an explicit `syscall` argument (`"spawn"` or `"spawnSync"`), where the
original shipped two separate functions (`verifyENOENT` / `verifyENOENTSync`).

### 4. TypeScript

`cross-spawn-esm` ships its own type definitions, so the third-party `@types/cross-spawn` package is no longer needed.

### API comparison

| Feature          | cross-spawn              | cross-spawn-esm          |
| ---------------- | ------------------------ | ------------------------ |
| Module format    | CommonJS                 | ESM (`"type": "module"`) |
| Async spawn      | `spawn` (default export) | `spawn` (named export)   |
| Sync spawn       | `spawn.sync`             | `spawnSync`              |
| Parse internals  | `spawn._parse`           | `_parse`                 |
| ENOENT internals | `spawn._enoent`          | `_enoent`                |
| Other internals  | not exposed              | `_utils`                 |
| TypeScript types | `@types/cross-spawn`     | built-in                 |

### Behavior notes

The following behaviors are intentionally kept identical to `cross-spawn`:

- When `options.shell` is used, parsing, escaping, and shebang enhancements are disabled — matching both the original and Node.js behavior.
- Windows-only ENOENT detection: when the process exits with code `1` and the command could not be resolved, an `error` event (async) or
  `result.error` (sync) is produced.
- Shebang support on Windows is limited to `#!/usr/bin/env <program>`.

## License

Released under the [MIT License](./LICENSE).
