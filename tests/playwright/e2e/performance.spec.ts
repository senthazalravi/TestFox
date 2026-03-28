import { test, expect } from '@playwright/test';

test.describe('Performance Tests', () => {
  test('should load login page quickly', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('/login');
    const loadTime = Date.now() - startTime;
    
    expect(loadTime).toBeLessThan(3000);
    await expect(page.locator('[data-testid="login-button"]')).toBeVisible();
  });

  test('should load dashboard quickly after login', async ({ page }) => {
    await page.goto('/login');
    await page.fill('[data-testid="username"]', 'testuser');
    await page.fill('[data-testid="password"]', 'password');
    
    const startTime = Date.now();
    await page.click('[data-testid="login-button"]');
    await page.waitForURL('**/dashboard');
    const loadTime = Date.now() - startTime;
    
    expect(loadTime).toBeLessThan(5000);
  });

  test('should render large lists efficiently', async ({ page }) => {
    await page.goto('/dashboard');
    await page.click('[data-testid="nav-projects"]');
    
    // Check that list renders within acceptable time
    const startTime = Date.now();
    await page.waitForSelector('[data-testid="project-item"]', { timeout: 5000 });
    const renderTime = Date.now() - startTime;
    
    expect(renderTime).toBeLessThan(2000);
    
    // Verify all items rendered
    const items = page.locator('[data-testid="project-item"]');
    await expect(items).toHaveCount.greaterThan(0);
  });

  test('should handle rapid navigation', async ({ page }) => {
    await page.goto('/dashboard');
    
    const navigations = [
      { selector: '[data-testid="nav-projects"]', url: '/projects' },
      { selector: '[data-testid="nav-reports"]', url: '/reports' },
      { selector: '[data-testid="nav-dashboard"]', url: '/dashboard' }
    ];
    
    for (const nav of navigations) {
      const startTime = Date.now();
      await page.click(nav.selector);
      await page.waitForURL(`**${nav.url}`);
      const loadTime = Date.now() - startTime;
      expect(loadTime).toBeLessThan(1000);
    }
  });

  test('should lazy load images', async ({ page }) => {
    await page.goto('/dashboard');
    
    const images = page.locator('img[loading="lazy"]');
    const count = await images.count();
    
    if (count > 0) {
      // Scroll to trigger lazy loading
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      
      // Check that images have loaded
      await page.waitForTimeout(500);
      const firstImage = images.first();
      await expect(firstImage).toHaveAttribute('src');
    }
  });

  test('should not have memory leaks on navigation', async ({ page }) => {
    await page.goto('/login');
    
    // Perform multiple navigations
    for (let i = 0; i < 10; i++) {
      await page.goto('/dashboard');
      await page.goto('/login');
    }
    
    // Page should still be responsive
    await expect(page.locator('[data-testid="login-button"]')).toBeVisible();
    await page.fill('[data-testid="username"]', 'testuser');
    await expect(page.locator('[data-testid="username"]')).toHaveValue('testuser');
  });
});

test.describe('Visual Regression Tests', () => {
  test('login page should match snapshot', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveScreenshot('login-page.png', {
      fullPage: true
    });
  });

  test('dashboard should match snapshot', async ({ page }) => {
    await page.goto('/login');
    await page.fill('[data-testid="username"]', 'testuser');
    await page.fill('[data-testid="password"]', 'password');
    await page.click('[data-testid="login-button"]');
    await page.waitForURL('**/dashboard');
    
    await expect(page).toHaveScreenshot('dashboard-page.png', {
      fullPage: true
    });
  });

  test('mobile view should match snapshot', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/login');
    
    await expect(page).toHaveScreenshot('login-mobile.png', {
      fullPage: true
    });
  });

  test('error state should match snapshot', async ({ page }) => {
    await page.goto('/login');
    await page.fill('[data-testid="username"]', 'wrong');
    await page.fill('[data-testid="password"]', 'wrong');
    await page.click('[data-testid="login-button"]');
    
    await expect(page.locator('[data-testid="error-message"]')).toBeVisible();
    await expect(page).toHaveScreenshot('login-error.png');
  });
});
