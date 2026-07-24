module.exports = {
    testEnvironment: 'node',
    testMatch: ['**/tests/**/*.test.js'],
    collectCoverageFrom: [
        'src/utils/**/*.js',
        '!**/node_modules/**'
    ],
    coverageDirectory: 'coverage',
    verbose: true
};
