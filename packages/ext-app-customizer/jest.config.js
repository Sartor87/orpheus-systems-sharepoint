module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts?(x)'],
  transform: {
    '^.+\.tsx?$': ['ts-jest', { tsconfig: { module: 'commonjs', esModuleInterop: true } }]
  }
};
