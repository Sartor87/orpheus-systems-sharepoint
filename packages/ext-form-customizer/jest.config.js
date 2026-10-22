module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  setupFiles: ['<rootDir>/src/__mocks__/setupIcons.js'],
  testMatch: ['**/__tests__/**/*.test.ts?(x)'],
  moduleNameMapper: {
    // Double backslash: '\.' in a JS string is just '.', which would also map modules such as Fluent's './css'.
    '\\.(css|scss)$': '<rootDir>/src/__mocks__/styleMock.js'
  },
  transform: {
    '^.+\.tsx?$': ['ts-jest', { tsconfig: { module: 'commonjs', jsx: 'react', esModuleInterop: true } }]
  }
};
