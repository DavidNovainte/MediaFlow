const globals = require("globals");
const pluginJs = require("@eslint/js");
const pluginJest = require("eslint-plugin-jest");

module.exports = [
    {
        ignores: [
            'src/libs/**/*.min.js'
        ]
    },
    pluginJs.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
            globals: {
                ...globals.browser,
                ...globals.node,
                ...globals.jest
            }
        },
        plugins: {
            jest: pluginJest
        },
        rules: {
            "indent": ["error", 4],
            "quotes": ["error", "single"],
            "semi": ["error", "always"],
            "no-unused-vars": "warn",
            "no-console": "off",
            "eqeqeq": "error"
        }
    }
];
