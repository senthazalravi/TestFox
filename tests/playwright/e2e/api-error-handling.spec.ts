import { test, expect } from '../fixtures';

test.describe('API and Network Tests', () => {
  test('should handle API errors gracefully', async ({ page }) => {
    // Intercept API call and force error
    await page.route('**/api/login', async route => {
      await route.fulfill({
        status: 500,
        body: JSON.stringify({ error: 'Server error' })
      });
    });
    
    await page.goto('/login');
    await page.fill('[data-testid="username"]', 'testuser');
    await page.fill('[data-testid="password"]', 'password');
    await page.click('[data-testid="login-button"]');
    
    await expect(page.locator('[data-testid="error-message"]')).toBeVisible();
    await expect(page.locator('[data-testid="error-message"]')).toContainText('Server error');
  });

  test('should handle network timeout', async ({ page }) => {
    await page.route('**/api/login', async route => {
      await new Promise(() => {}); // Never resolve
    });
    
    await page.goto('/login');
    await page.fill('[data-testid="username"]', 'testuser');
    await page.fill('[data-testid="password"]', 'password');
    await page.click('[data-testid="login-button"]');
    
    // Should show timeout error after some time
    await expect(page.locator('[data-testid="error-message"]')).toBeVisible({ timeout: 35000 });
  });

  test('should retry failed requests', async ({ page }) => {
    let attempts = 0;
    await page.route('**/api/data', async route => {
      attempts++;
      if (attempts < 3) {
        await route.fulfill({ status: 503 });
      } else {
        await route.fulfill({ 
          status: 200, 
          body: JSON.stringify({ data: 'success' }) 
        });
      }
    });
    
    await page.goto('/dashboard');
    // Data should eventually load after retries
    await expect(page.locator('[data-testid="data-loaded"]')).toBeVisible();
  });

  test('should handle 401 unauthorized', async ({ page }) => {
    await page.route('**/api/protected', async route => {
      await route.fulfill({ status: 401 });
    });
    
    await page.goto('/dashboard');
    // Should redirect to login
    await expect(page).toHaveURL('**/login');
  });

  test('should handle 403 forbidden', async ({ page }) => {
    await page.route('**/api/admin', async route => {
      await route.fulfill({ status: 403 });
    });
    
    await page.goto('/admin');
    await expect(page.locator('[data-testid="forbidden-message"]')).toBeVisible();
  });

  test('should handle rate limiting (429)', async ({ page }) => {
    await page.route('**/api/action', async route => {
      await route.fulfill({ 
        status: 429,
        headers: { 'Retry-After': '5' },
        body: JSON.stringify({ error: 'Too many requests' })
      });
    });
    
    await page.goto('/dashboard');
    await page.click('[data-testid="action-button"]');
    
    await expect(page.locator('[data-testid="rate-limit-message"]')).toBeVisible();
  });

  test('should cancel pending requests on navigation', async ({ page }) => {
    await page.route('**/api/slow', async route => {
      await new Promise(resolve => setTimeout(resolve, 10000));
      await route.fulfill({ status: 200 });
    });
    
    await page.goto('/dashboard');
    await page.click('[data-testid="load-slow-data"]');
    
    // Navigate away before request completes
    await page.click('[data-testid="nav-settings"]');
    
    // Should not show errors from cancelled request
    await expect(page.locator('[data-testid="error-message"]')).toBeHidden();
  });
});
