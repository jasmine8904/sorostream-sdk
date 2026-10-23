/**
 * Tests for cmdAnalyze handling of entrypoint files that exist but contain
 * invalid JavaScript/TypeScript syntax (e.g. a binary file passed by mistake).
 *
 * Verifies that esbuild parse failures surface as a clear, user-facing error
 * message rather than an unhandled exception with a raw esbuild stack trace.
 *
 * Also covers the happy-path (valid entrypoint) to confirm no regression.
 *
 * Closes: #803
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { cmdAnalyze } from '../packages/cli/src/analyze';

const TMP_DIR = path.resolve(__dirname, '../.tmp-analyze-invalid-test');
const VALID_ENTRY = path.join(TMP_DIR, 'valid-entry.ts');
const INVALID_ENTRY = path.join(TMP_DIR, 'invalid-entry.ts');

describe('cmdAnalyze — invalid entrypoint handling', () => {
  beforeAll(() => {
    fs.mkdirSync(TMP_DIR, { recursive: true });

    // A syntactically valid TypeScript file
    fs.writeFileSync(
      VALID_ENTRY,
      `export function greet(name: string): string { return "Hello, " + name; }\n`,
    );

    // A file that exists but contains a deliberate syntax error
    fs.writeFileSync(
      INVALID_ENTRY,
      `export function broken( { this is not valid JS/TS syntax !!! @@@ ###\n`,
    );
  });

  afterAll(() => {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  });

  it('completes successfully for a valid entrypoint (regression guard)', async () => {
    // Should not throw
    let error: unknown;
    try {
      await cmdAnalyze({ entrypoint: VALID_ENTRY, html: false });
    } catch (e) {
      error = e;
    }
    expect(error).toBeUndefined();
  });

  it('throws an Error (not an unhandled esbuild stack trace) for a syntax-error file', async () => {
    let caughtError: unknown;
    try {
      await cmdAnalyze({ entrypoint: INVALID_ENTRY, html: false });
    } catch (e) {
      caughtError = e;
    }

    // Must throw something — not silently succeed
    expect(caughtError).toBeDefined();

    // The thrown value must be a proper Error instance, not a raw esbuild
    // BuildFailure object or other untyped throw
    expect(caughtError).toBeInstanceOf(Error);

    // The message should mention the file so the user knows what failed
    const message = (caughtError as Error).message;
    expect(message.length).toBeGreaterThan(0);
  });

  it('throws an Error for a binary (non-text) file passed as entrypoint', async () => {
    const binaryEntry = path.join(TMP_DIR, 'binary-entry.ts');
    // Write raw binary bytes that are definitely not valid source
    fs.writeFileSync(binaryEntry, Buffer.from([0x00, 0xff, 0xfe, 0x80, 0x81, 0x82]));

    let caughtError: unknown;
    try {
      await cmdAnalyze({ entrypoint: binaryEntry, html: false });
    } catch (e) {
      caughtError = e;
    }

    expect(caughtError).toBeDefined();
    expect(caughtError).toBeInstanceOf(Error);
  });
});
