// Used often in code so i dicided to put it in here
export const isWin = process.platform === "win32";

export const cwd = process.cwd();
export const env = process.env;

// REGULAR EXPRESSIONS
// From https://github.com/sindresorhus/shebang-regex
export const shebangRegExp = /^#!(.*)/;

// See http://www.robvanderwoude.com/escapechars.php
export const metaCharsRegExp = /([()\][%!^"`<>&|;, *?])/g;

export const executableRegExp = /\.(?:com|exe)$/i;
export const cmdShimRegExp = /node_modules[\\/].bin[\\/][^\\/]+\.cmd$/i;
