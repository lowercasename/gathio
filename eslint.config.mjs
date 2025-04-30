// @ts-check
import globals from "globals";
import { globalIgnores } from "eslint/config";
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
    globalIgnores(["dist/", "public/js/**/*.js"]),
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
    eslint.configs.recommended,
    tseslint.configs.recommended,
);
