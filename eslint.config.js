import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/coverage/**",
      "**/dist/**",
      "**/node_modules/**",
      "packages/contracts/schemas/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ["**/*.{cjs,js,mjs}"],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: [
      "apps/{cli,daemon}/**/*.ts",
      "packages/{agent-runner,command-client,evidence-store,git-workspace,independent-review,kernel,process-supervisor,quality,scheduler,testkit,trusted-verifier}/**/*.ts",
      "tests/**/*.ts",
    ],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ["**/*.ts"],
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          fixStyle: "inline-type-imports",
          prefer: "type-imports",
        },
      ],
      "@typescript-eslint/no-import-type-side-effects": "error",
    },
  },
);
