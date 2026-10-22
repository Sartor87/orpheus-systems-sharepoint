module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts?(x)'],
  moduleNameMapper: {
    '\.(css|scss)$': '<rootDir>/src/__mocks__/styleMock.js'
  },
  transform: {
    '^.+\.tsx?$': ['ts-jest', { tsconfig: { module: 'commonjs', jsx: 'react', esModuleInterop: true } }]
  }
};
