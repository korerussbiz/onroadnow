import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    files: ["**/*.js"],
    ignores: ["**/node_modules/**", "**/dist/**"],
    rules: {
      "semi": ["error", "always"],
      "quotes": ["error", "single"],
      "no-unused-vars": "warn",
      "indent": ["error", 2]
    }
  }
];
