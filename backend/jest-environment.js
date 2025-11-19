const NodeEnvironment = require('jest-environment-node').default;

class CustomEnvironment extends NodeEnvironment {
  constructor(config, context) {
    // Node.js 버전 호환성을 위해 config 객체 수정
    const customConfig = {
      ...config,
      projectConfig: {
        ...config.projectConfig,
        testEnvironmentOptions: {
          ...config.projectConfig?.testEnvironmentOptions
        }
      }
    };

    super(customConfig, context);

    // Mock localStorage immediately in constructor
    this.global.localStorage = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      length: 0,
      key: () => null,
    };
  }

  async setup() {
    await super.setup();

    // Ensure localStorage is still mocked after setup
    this.global.localStorage = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      length: 0,
      key: () => null,
    };
  }
}

module.exports = CustomEnvironment;
