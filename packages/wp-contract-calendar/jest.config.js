module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts?(x)'],
  transform: {
    '^.+\.tsx?$': ['ts-jest', { tsconfig: { module: 'commonjs', jsx: 'react', esModuleInterop: true } }]
  }
};
