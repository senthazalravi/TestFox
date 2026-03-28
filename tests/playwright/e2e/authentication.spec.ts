import { test, expect } from '../fixtures';

test.describe('Authentication Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('should display login form correctly', async ({ page }) => {
    await expect(page.locator('[data-testid="username"]')).toBeVisible();
    await expect(page.locator('[data-testid="password"]')).toBeVisible();
    await expect(page.locator('[data-testid="login-button"]')).toBeVisible();
    await expect(page.locator('h1:has-text("Login")')).toBeVisible();
  });

  test('should login with valid credentials', async ({ page }) => {
    await page.fill('[data-testid="username"]', 'testuser');
    await page.fill('[data-testid="password"]', 'password');
    await page.click('[data-testid="login-button"]');
    
    await expect(page).toHaveURL('**/dashboard');
    await expect(page.locator('[data-testid="dashboard"]')).toBeVisible();
    await expect(page.locator('[data-testid="user-menu"]')).toContainText('testuser');
  });

  test('should show error with invalid credentials', async ({ page }) => {
    await page.fill('[data-testid="username"]', 'wronguser');
    await page.fill('[data-testid="password"]', 'wrongpassword');
    await page.click('[data-testid="login-button"]');
    
    await expect(page.locator('[data-testid="error-message"]')).toBeVisible();
    await expect(page.locator('[data-testid="error-message"]')).toContainText('Invalid');
    await expect(page).toHaveURL('**/login');
  });

  test('should show error with empty username', async ({ page }) => {
    await page.fill('[data-testid="password"]', 'password');
    await page.click('[data-testid="login-button"]');
    
    await expect(page.locator('[data-testid="error-message"]')).toBeVisible();
    await expect(page.locator('[data-testid="error-message"]')).toContainText('username');
  });

  test('should show error with empty password', async ({ page }) => {
    await page.fill('[data-testid="username"]', 'testuser');
    await page.click('[data-testid="login-button"]');
    
    await expect(page.locator('[data-testid="error-message"]')).toBeVisible();
    await expect(page.locator('[data-testid="error-message"]')).toContainText('password');
  });

  test('should redirect to login when accessing protected route unauthenticated', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL('**/login');
    await expect(page.locator('[data-testid="error-message"]')).toContainText('Please log in');
  });

  test('should persist session across page reloads', async ({ page, context }) => {
    await page.fill('[data-testid="username"]', 'testuser');
    await page.fill('[data-testid="password"]', 'password');
    await page.click('[data-testid="login-button"]');
    await page.waitForURL('**/dashboard');
    
    // Reload page
    await page.reload();
    await expect(page.locator('[data-testid="dashboard"]')).toBeVisible();
    await expect(page.locator('[data-testid="user-menu"]')).toContainText('testuser');
  });

  test('should logout successfully', async ({ page }) => {
    // Login first
    await page.fill('[data-testid="username"]', 'testuser');
    await page.fill('[data-testid="password"]', 'password');
    await page.click('[data-testid="login-button"]');
    await page.waitForURL('**/dashboard');
    
    // Logout
    await page.click('[data-testid="logout-button"]');
    await expect(page).toHaveURL('**/login');
    await expect(page.locator('[data-testid="login-button"]')).toBeVisible();
    
    // Verify protected route redirects to login
    await page.goto('/dashboard');
    await expect(page).toHaveURL('**/login');
  });

  test('should logout from user menu', async ({ page }) => {
    // Login first
    await page.fill('[data-testid="username"]', 'testuser');
    await page.fill('[data-testid="password"]', 'password');
    await page.click('[data-testid="login-button"]');
    await page.waitForURL('**/dashboard');
    
    // Open user menu and logout
    await page.click('[data-testid="user-menu"]');
    await page.click('[data-testid="logout-option"]');
    await expect(page).toHaveURL('**/login');
  });
});
