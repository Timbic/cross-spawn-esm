// Used often in code so i dicided to put it in here
export const isWin = process.platform === "win32";

// Data from current Node process
export const _cwd = process.cwd();
export const _env = process.env;

// REGULAR EXPRESSIONS

// From https://github.com/sindresorhus/shebang-regex
export const shebangRegExp = /^#!(.*)/;

// Thank Windows for crlf
export const lineBreaksRegExp = /[\r\n]+/g;

// See http://www.robvanderwoude.com/escapechars.php
export const metaCharsRegExp = /([()\][%!^"`<>&|;, *?])/g;

// To match .exe files
export const executableRegExp = /\.(?:exe)$/i;

// To match .cmd files inside node_modules .bin
export const cmdShimRegExp = /node_modules[\\/].bin[\\/][^\\/]+\.cmd$/i;
