import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["dist/", "node_modules/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        // Extension background runs as a service worker / event page.
        console: "readonly",
      },
    },
  },
  // Keep ESLint out of Prettier's lane: disable formatting rules.
  prettier,
);
