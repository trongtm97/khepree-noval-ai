import { describe, expect, it } from 'vitest';
import {
  isSupportedPythonVersionOutput,
  WINDOWS_PYTHON_COMMANDS,
} from '../../../src/main/ai/python-detect';

describe('isSupportedPythonVersionOutput', () => {
  it('accepts 3.11, 3.12, 3.14', () => {
    expect(isSupportedPythonVersionOutput('Python 3.11.9')).toBe(true);
    expect(isSupportedPythonVersionOutput('Python 3.12.12')).toBe(true);
    expect(isSupportedPythonVersionOutput('Python 3.14.7')).toBe(true);
  });

  it('rejects 3.10 and missing version', () => {
    expect(isSupportedPythonVersionOutput('Python 3.10.11')).toBe(false);
    expect(isSupportedPythonVersionOutput('Python was not found')).toBe(false);
  });
});

describe('WINDOWS_PYTHON_COMMANDS', () => {
  it('includes py -3 so latest 3.x (e.g. 3.14) is found', () => {
    expect(WINDOWS_PYTHON_COMMANDS[0]).toBe('py -3');
    expect(WINDOWS_PYTHON_COMMANDS).toContain('py -3.14');
  });
});
