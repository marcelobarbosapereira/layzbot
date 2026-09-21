import { describe, expect, it } from 'vitest';
import { readAgentConfig } from './config';

describe('readAgentConfig', () => {
  const valid = {
    LAZYBOT_URL: 'https://example.invalid/',
    LAZYBOT_DEVICE_TOKEN: 'fabricated-token',
    LAZYBOT_DEVICE_NAME: 'test-device',
    LAZYBOT_OS: 'linux',
    LAZYBOT_AGENT_VERSION: '0.1.0',
  };

  it('requires every startup field without exposing a secret in errors', () => {
    expect(readAgentConfig(valid)).toMatchObject({
      url: 'https://example.invalid', deviceToken: 'fabricated-token', deviceName: 'test-device',
    });
    expect(() => readAgentConfig({ ...valid, LAZYBOT_DEVICE_NAME: '' })).toThrow('INVALID_CONFIGURATION');
    expect(() => readAgentConfig({ ...valid, LAZYBOT_URL: 'not a URL' })).toThrow('INVALID_CONFIGURATION');
    expect(() => readAgentConfig({ ...valid, LAZYBOT_DEVICE_TOKEN: '' })).toThrow('INVALID_CONFIGURATION');
    try {
      readAgentConfig({ ...valid, LAZYBOT_URL: 'Authorization: Bearer fabricated-token' });
    } catch (error) {
      expect(String(error)).not.toContain('fabricated-token');
    }
  });
});
