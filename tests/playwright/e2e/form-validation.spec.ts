import { test, expect } from '@playwright/test';

test.describe('Form Validation Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('should validate required fields', async ({ page }) => {
    await page.click('[data-testid="login-button"]');
    
    const usernameError = page.locator('[data-testid="username-error"]');
    const passwordError = page.locator('[data-testid="password-error"]');
    
    await expect(usernameError).toBeVisible();
    await expect(passwordError).toBeVisible();
    await expect(usernameError).toContainText('required');
  });

  test('should validate minimum username length', async ({ page }) => {
    await page.fill('[data-testid="username"]', 'ab');
    await page.fill('[data-testid="password"]', 'password123');
    await page.click('[data-testid="login-button"]');
    
    await expect(page.locator('[data-testid="username-error"]')).toContainText('at least 3 characters');
  });

  test('should validate password minimum length', async ({ page }) => {
    await page.fill('[data-testid="username"]', 'testuser');
    await page.fill('[data-testid="password"]', '123');
    await page.click('[data-testid="login-button"]');
    
    await expect(page.locator('[data-testid="password-error"]')).toContainText('at least 6 characters');
  });

  test('should validate email format on registration', async ({ page }) => {
    await page.goto('/register');
    
    await page.fill('[data-testid="email"]', 'invalid-email');
    await page.fill('[data-testid="password"]', 'password123');
    await page.click('[data-testid="register-button"]');
    
    await expect(page.locator('[data-testid="email-error"]')).toContainText('valid email');
  });

  test('should validate password confirmation match', async ({ page }) => {
    await page.goto('/register');
    
    await page.fill('[data-testid="password"]', 'password123');
    await page.fill('[data-testid="password-confirm"]', 'password456');
    await page.click('[data-testid="register-button"]');
    
    await expect(page.locator('[data-testid="password-confirm-error"]')).toContainText('do not match');
  });

  test('should clear validation errors on input', async ({ page }) => {
    await page.click('[data-testid="login-button"]');
    await expect(page.locator('[data-testid="username-error"]')).toBeVisible();
    
    await page.fill('[data-testid="username"]', 'testuser');
    await expect(page.locator('[data-testid="username-error"]')).toBeHidden();
  });

  test('should validate special characters in username', async ({ page }) => {
    await page.fill('[data-testid="username"]', 'user@name!');
    await page.fill('[data-testid="password"]', 'password123');
    await page.click('[data-testid="login-button"]');
    
    await expect(page.locator('[data-testid="username-error"]')).toContainText('alphanumeric');
  });

  test('should trim whitespace from inputs', async ({ page }) => {
    await page.fill('[data-testid="username"]', '  testuser  ');
    await page.fill('[data-testid="password"]', 'password');
    await page.click('[data-testid="login-button"]');
    
    // Should succeed after trimming
    await expect(page).toHaveURL('**/dashboard');
  });
});
