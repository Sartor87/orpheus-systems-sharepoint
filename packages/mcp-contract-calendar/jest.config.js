module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  // Transpile only: type checking is `npm run typecheck` (tsc --noEmit).
  // jose 6 is ESM-only; Jest has to transpile it to CommonJS (production Node 22 can require() it natively).
  transform: {
    '^.+\.ts$': ['ts-jest', { isolatedModules: true }],
    '^.+/node_modules/jose/.+\.js$': ['ts-jest', { isolatedModules: true, tsconfig: { allowJs: true, module: 'commonjs', target: 'es2022' } }]
  },
  transformIgnorePatterns: ['/node_modules/(?!jose/)']
};
