/**
 * Health check tests — verifies the server is up and the response shape is correct.
 * This endpoint requires no auth and returns no employee data.
 * It is a useful sanity check to run before any other test suite.
 */
import { test, expect } from '@playwright/test';

test.describe('GET /health', () => {
  test('returns status ok with version and time', async ({ request }) => {
    const res = await request.get('/health');

    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.status).toBe('ok');      // literal string — not a boolean
    expect(body.version).toBe('1.0.0'); // pinned so a version bump is caught immediately
    expect(body.time).toBeTruthy();     // ISO timestamp — just check it is present
    expect(body.requestId).toBeTruthy(); // every response carries a unique trace ID
  });
});
