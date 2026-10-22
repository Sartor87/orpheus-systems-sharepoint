module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  // shared-core lib/ is ESM and its barrel pulls in @pnp; tests use a shim over its pure sources
  moduleNameMapper: { '^@orpheussystems/shared-core$': '<rootDir>/src/__tests__/coreShim.ts' },
  transform: {
    '^.+\.ts$': ['ts-jest', { tsconfig: { module: 'commonjs', esModuleInterop: true, resolveJsonModule: true, target: 'es2019', strict: true } }]
  }
};
