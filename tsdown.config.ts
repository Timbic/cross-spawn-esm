import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["src/index.ts"],
	target: "node22",
	fixedExtension: false,
	outputOptions: {
		comments: {
			jsdoc: false,
		},
	},
});
