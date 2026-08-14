/**
 * Minimal jest setup for PURE service logic only — the first test infrastructure
 * in mobile/. This is deliberately not jest-expo: nothing here renders a
 * component or touches native modules. Native deps used by services under test
 * are mapped to hand-written mocks below; anything needing a renderer still
 * gets verified by `tsc --noEmit` and device testing (see plans/current-phase.md
 * on standing up jest-expo as its own piece of work).
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        // Standalone compiler options — the app tsconfig extends expo's base,
        // which assumes the metro/babel pipeline rather than ts-jest.
        tsconfig: {
          module: 'commonjs',
          target: 'es2019',
          esModuleInterop: true,
          strict: true,
          skipLibCheck: true,
        },
      },
    ],
  },
  moduleNameMapper: {
    '^expo-secure-store$': '<rootDir>/src/services/__tests__/mocks/secureStore.ts',
  },
};
