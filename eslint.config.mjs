// Flat-config replacement for `next lint` (deprecated in Next 15, removed
// in Next 16). The codemod (`next-lint-to-eslint-cli`) generated an
// `eslint-config-next/core-web-vitals` flat import, but the version of
// `eslint-config-next` pinned here (15.x) still ships a legacy
// `extends`-style export, so we bridge it through `FlatCompat`.
//
// Behaviour matches the prior `next lint` strict default: the
// `next/core-web-vitals` ruleset over the whole tree, with build and
// generated dirs ignored.
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const __dirname = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  ...compat.extends("next/core-web-vitals"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
];

export default eslintConfig;
