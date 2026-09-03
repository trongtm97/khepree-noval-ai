import { describe, expect, it } from 'vitest';
import {
  EXECUTABLE_NAME,
  SQUIRREL_PACKAGE_NAME,
  WINDOWS_SQUIRREL_APP_USER_MODEL_ID,
} from '@shared/constants/app';

describe('Windows Squirrel AppUserModelId', () => {
  it('matches com.squirrel.<package-id>.<exe-name> and forge MakerSquirrel name', () => {
    expect(SQUIRREL_PACKAGE_NAME).toBe(EXECUTABLE_NAME);
    expect(WINDOWS_SQUIRREL_APP_USER_MODEL_ID).toBe(
      `com.squirrel.${SQUIRREL_PACKAGE_NAME}.${EXECUTABLE_NAME}`,
    );
  });
});
