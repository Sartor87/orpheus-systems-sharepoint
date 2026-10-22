module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\.ts$': ['ts-jest', { tsconfig: { module: 'commonjs', esModuleInterop: true, target: 'es2019', strict: true } }]
  }
};
