const paceCoreConfig = require('@solvera/pace-core/eslint-config');
const js = require('@eslint/js');

let tseslint = null;
let react = null;
let reactHooks = null;

try { tseslint = require('typescript-eslint'); } catch {}
try { react = require('eslint-plugin-react'); } catch {}
try { reactHooks = require('eslint-plugin-react-hooks'); } catch {}

const config = [
  ...paceCoreConfig,
  js.configs.recommended,
];

if (tseslint?.configs?.recommended) {
  config.push(...tseslint.configs.recommended);
}

if (react?.configs?.recommended?.rules && reactHooks?.configs?.recommended?.rules) {
  config.push({
    files: ['**/*.{ts,tsx}'],
    plugins: {
      react,
      'react-hooks': reactHooks,
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        React: 'readonly',
        JSX: 'readonly',
      },
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
    },
  });
}

config.push({
  ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'audit/**', '**/*.cjs'],
});

module.exports = config;
