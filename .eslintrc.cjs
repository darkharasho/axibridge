module.exports = {
    root: true,
    env: {
        browser: true,
        node: true,
        es2022: true
    },
    parser: '@typescript-eslint/parser',
    parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
            jsx: true
        }
    },
    plugins: [
        '@typescript-eslint',
        'react-hooks',
        'react-refresh'
    ],
    extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended',
        'plugin:react-hooks/recommended'
    ],
    settings: {
        react: {
            version: 'detect'
        }
    },
    rules: {
        'react-refresh/only-export-components': 'off',
        'react-hooks/rules-of-hooks': 'off',
        'react-hooks/exhaustive-deps': 'off',
        'prefer-const': 'off',
        'no-useless-escape': 'off',
        'no-useless-catch': 'off',
        '@typescript-eslint/no-unused-vars': ['off'],
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-var-requires': 'off',
        '@typescript-eslint/ban-ts-comment': 'off'
    },
    ignorePatterns: [
        'dist-electron/',
        'dist-react/',
        'dist-web/',
        'dist_out/',
        'node_modules/',
        'web/',
        'test-fixtures/',
        'coverage/'
    ]
};
