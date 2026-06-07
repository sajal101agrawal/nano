/** @type {import('jest').Config} */
const config = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src", "<rootDir>/worker"],
  testMatch: ["**/__tests__/**/*.test.ts", "**/*.test.ts"],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: {
          jsx: "react",
          esModuleInterop: true,
          moduleResolution: "node",
          module: "commonjs",
          isolatedModules: true,
        },
      },
    ],
  },
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  collectCoverageFrom: [
    "src/lib/**/*.ts",
    "worker/src/**/*.ts",
    "!**/*.d.ts",
    "!**/node_modules/**",
  ],
};

module.exports = config;
