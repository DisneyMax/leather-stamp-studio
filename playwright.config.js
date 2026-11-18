const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  use: {
    launchOptions: {
      executablePath: process.env.LEATHER_STAMP_CHROMIUM || undefined,
      args: ['--enable-unsafe-swiftshader'],
    },
  },
});
