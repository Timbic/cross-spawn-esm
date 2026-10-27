// Data from current Node process
export const _cwd = process.cwd();
export const _env = process.env;
export const _platform = process.platform;

// Used often in code so i dicided to put it in here
export const isWin = _platform === "win32";
