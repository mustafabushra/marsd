import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

/**
 * The linter this project already had, actually running.
 *
 * .eslintrc.json existed and described a full setup — react, react-hooks,
 * typescript, prettier. Nothing ran it: there was no lint script, eslint was not
 * a dependency, and eslint 9+ does not read .eslintrc.json without being told
 * to. A configuration nobody runs is documentation of an intention.
 *
 * The rule that matters here is no-undef. AdminReportAnalytics kept two
 * references to bindings that had been deleted — `reviewTimes.length` and
 * `withDelay.length` — and `vite build` reported success, because rollup does no
 * scope analysis on identifiers inside JSX. The page would have thrown on
 * render. That is the same shape as the missing useUserRole import that
 * verify-imports was written for, and it is worth one tool rather than two.
 *
 * Deliberately narrow. A linter that reports three hundred style opinions on
 * first run is a linter people add --max-warnings=999 to and stop reading; this
 * one reports things that break at runtime.
 */
export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'backend/**', 'public/**'],
  },
  {
    files: ['**/*.{js,jsx,mjs,ts,tsx}'],
    languageOptions: {
      // The TypeScript parser for every file, not only .ts — the project mixes
      // .jsx and .ts freely and one parser that reads both keeps the rules
      // identical across them.
      parser: tseslint.parser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        ...globals.browser,
        ...globals.node,
        // Type-only namespaces the .ts files reference. They exist to the type
        // checker and never at runtime, so no-undef is right to ask and wrong to
        // fail — declaring them is how you say "this one is a type".
        React: 'readonly',
        NodeJS: 'readonly',
      },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...js.configs.recommended.rules,

      // Files already carry eslint-disable comments for this rule, which
      // error out when the rule is not defined. It also catches stale
      // closures in a codebase built on useCallback and useEffect.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // Errors, because each one throws or silently does nothing at runtime.
      'no-undef': 'error',
      'no-unsafe-optional-chaining': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'no-unreachable': 'error',
      // The one that would have caught the stray backspace byte in
      // verify-literals and again in audit-screens: a control character in a
      // regex is almost never what was typed, and a pattern that matches nothing
      // reports a clean pass.
      'no-control-regex': 'error',

      // Style, not crashes. On as warnings so they are visible without making
      // the command red — a check that is always red is a check people skip.
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-useless-assignment': 'warn',
      'preserve-caught-error': 'off',
      'no-irregular-whitespace': ['error', { skipRegExps: true, skipStrings: true }],
      'no-empty': 'off',
      'no-console': 'off',
    },
  },
]
