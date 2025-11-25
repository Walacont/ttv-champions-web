module.exports = {
    testEnvironment: 'node',
    coveragePathIgnorePatterns: ['/node_modules/'],
    testMatch: ['**/__tests__/**/*.test.js'],
    collectCoverageFrom: ['index.js', '!**/node_modules/**'],
    verbose: true,
};
