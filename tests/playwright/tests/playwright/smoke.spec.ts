import { test, expect } from './fixtures';

test.describe('Smoke Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('page loads successfully', async ({ page }) => {
    await expect(page.locator('h1')).toBeVisible();
  });

  test('navigation works', async ({ page }) => {
    await page.click('[data-testid="nav-home"]');
    await expect(page).toHaveURL('/');
  });
});