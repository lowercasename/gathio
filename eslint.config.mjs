// @ts-check
import globals from "globals";
import { globalIgnores } from "eslint/config";
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import pluginCypress from "eslint-plugin-cypress/flat";

export default tseslint.config(
    globalIgnores(["dist/", "public/js/**/*.js"]),
    eslint.configs.recommended,
    tseslint.configs.recommended,
    {
        languageOptions: {
            globals: {
                ...globals.node,
            },
        },
    },
    {
        rules: {
            "@typescript-eslint/no-unused-vars": [
                "error",
                { argsIgnorePattern: "^_" },
            ],
        },
    },
    {
        files: ["cypress/**/*.ts"],
        plugins: {
            cypress: pluginCypress,
        },
        ...pluginCypress.configs.recommended,
        rules: {
            "@typescript-eslint/no-unused-expressions": "off",
        },
    },
);
