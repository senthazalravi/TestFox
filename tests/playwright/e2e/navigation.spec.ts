import { test, expect } from '@playwright/test';

test.describe('Navigation and UI Tests', () => {
  test('should have correct page title', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveTitle(/Login|TestFox/);
  });

  test('should navigate to forgot password page', async ({ page }) => {
    await page.goto('/login');
    await page.click('[data-testid="forgot-password-link"]');
    await expect(page).toHaveURL('**/forgot-password');
    await expect(page.locator('h1')).toContainText('Forgot Password');
  });

  test('should navigate to registration page', async ({ page }) => {
    await page.goto('/login');
    await page.click('[data-testid="register-link"]');
    await expect(page).toHaveURL('**/register');
    await expect(page.locator('h1')).toContainText('Register');
  });

  test('should have working back button', async ({ page }) => {
    await page.goto('/login');
    await page.click('[data-testid="register-link"]');
    await expect(page).toHaveURL('**/register');
    
    await page.click('[data-testid="back-button"]');
    await expect(page).toHaveURL('**/login');
  });

  test('should display loading states correctly', async ({ page }) => {
    await page.goto('/login');
    await page.fill('[data-testid="username"]', 'testuser');
    await page.fill('[data-testid="password"]', 'password');
    
    await page.click('[data-testid="login-button"]');
    await expect(page.locator('[data-testid="loading-spinner"]')).toBeVisible();
    await expect(page.locator('[data-testid="login-button"]')).toBeDisabled();
  });

  test('should handle browser back button after login', async ({ page }) => {
    // Login
    await page.goto('/login');
    await page.fill('[data-testid="username"]', 'testuser');
    await page.fill('[data-testid="password"]', 'password');
    await page.click('[data-testid="login-button"]');
    await page.waitForURL('**/dashboard');
    
    // Go back
    await page.goBack();
    // Should stay on dashboard (protected route)
    await expect(page).toHaveURL('**/dashboard');
  });

  test('should have responsive layout on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/login');
    
    await expect(page.locator('[data-testid="login-form"]')).toBeVisible();
    const form = page.locator('[data-testid="login-form"]');
    const box = await form.boundingBox();
    expect(box?.width).toBeLessThan(375);
  });

  test('should have responsive layout on tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/login');
    
    await expect(page.locator('[data-testid="login-form"]')).toBeVisible();
  });

  test('should handle keyboard navigation', async ({ page }) => {
    await page.goto('/login');
    
    // Tab through form fields
    await page.press('[data-testid="username"]', 'Tab');
    await expect(page.locator('[data-testid="password"]')).toBeFocused();
    
    await page.press('[data-testid="password"]', 'Tab');
    await expect(page.locator('[data-testid="login-button"]')).toBeFocused();
  });

  test('should submit form on Enter key', async ({ page }) => {
    await page.goto('/login');
    await page.fill('[data-testid="username"]', 'testuser');
    await page.fill('[data-testid="password"]', 'password');
    
    await page.press('[data-testid="password"]', 'Enter');
    await expect(page).toHaveURL('**/dashboard');
  });

  test('should display footer correctly', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('[data-testid="footer"]')).toBeVisible();
    await expect(page.locator('[data-testid="footer"]')).toContainText('©');
  });

  test('should have working help link', async ({ page, context }) => {
    await page.goto('/login');
    
    const [newPage] = await Promise.all([
      context.waitForEvent('page'),
      page.click('[data-testid="help-link"]')
    ]);
    
    await newPage.waitForLoadState();
    expect(newPage.url()).toContain('help');
  });

  test('should show 404 page for invalid routes', async ({ page }) => {
    await page.goto('/nonexistent-route');
    await expect(page.locator('h1')).toContainText('404');
    await expect(page.locator('[data-testid="back-home-link"]')).toBeVisible();
  });

  test('should navigate home from 404 page', async ({ page }) => {
    await page.goto('/nonexistent-route');
    await page.click('[data-testid="back-home-link"]');
    await expect(page).toHaveURL('**/');
  });
});
