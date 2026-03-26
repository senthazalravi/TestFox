import { test, expect } from './fixtures';

test.describe('E2E Tests', () => {
  test('user can login and view dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.fill('[data-testid="username"]', 'testuser');
    await page.fill('[data-testid="password"]', 'password');
    await page.click('[data-testid="login-button"]');
    await expect(page.locator('[data-testid="dashboard"]')).toBeVisible();
  });

  test('user can logout', async ({ page }) => {
    await page.goto('/dashboard');
    await page.click('[data-testid="logout-button"]');
    await expect(page).toHaveURL('/login');
  });
});