module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  // Transpile only: type checking is `npm run typecheck` (tsc --noEmit).
  transform: { '^.+\.ts$': ['ts-jest', { isolatedModules: true }] }
};
