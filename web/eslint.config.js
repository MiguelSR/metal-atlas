import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["node_modules/"] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ["vitest.config.ts"] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // with noUncheckedIndexedAccess every array index is `T | undefined`; `!` marks indices known to be valid
      "@typescript-eslint/no-non-null-assertion": "off",
      // HTML is built with template strings: numbers inside them are fine
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      // `void promise` marks fire-and-forget calls (event handlers)
      "@typescript-eslint/no-confusing-void-expression": ["error", { ignoreArrowShorthand: true }],
    },
  },
  {
    files: ["eslint.config.js"],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
