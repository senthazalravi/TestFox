import { test, expect } from '../fixtures';

test.describe('Dashboard Tests', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    // authenticatedPage fixture handles login
  });

  test('should display dashboard layout correctly', async ({ page }) => {
    await expect(page.locator('[data-testid="dashboard-header"]')).toBeVisible();
    await expect(page.locator('[data-testid="sidebar"]')).toBeVisible();
    await expect(page.locator('[data-testid="main-content"]')).toBeVisible();
    await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
  });

  test('should display dashboard stats cards', async ({ page }) => {
    const statCards = page.locator('[data-testid="stat-card"]');
    await expect(statCards).toHaveCount(4);
    
    await expect(page.locator('[data-testid="stat-card-total"]')).toContainText('Total');
    await expect(page.locator('[data-testid="stat-card-active"]')).toContainText('Active');
    await expect(page.locator('[data-testid="stat-card-pending"]')).toContainText('Pending');
    await expect(page.locator('[data-testid="stat-card-completed"]')).toContainText('Completed');
  });

  test('should display recent activity list', async ({ page }) => {
    await expect(page.locator('[data-testid="recent-activity"]')).toBeVisible();
    await expect(page.locator('[data-testid="activity-item"]').first()).toBeVisible();
  });

  test('should navigate to different sections via sidebar', async ({ page }) => {
    // Navigate to Projects
    await page.click('[data-testid="nav-projects"]');
    await expect(page).toHaveURL('**/projects');
    await expect(page.locator('[data-testid="projects-page"]')).toBeVisible();
    
    // Navigate to Reports
    await page.click('[data-testid="nav-reports"]');
    await expect(page).toHaveURL('**/reports');
    await expect(page.locator('[data-testid="reports-page"]')).toBeVisible();
    
    // Navigate to Settings
    await page.click('[data-testid="nav-settings"]');
    await expect(page).toHaveURL('**/settings');
    await expect(page.locator('[data-testid="settings-page"]')).toBeVisible();
    
    // Back to Dashboard
    await page.click('[data-testid="nav-dashboard"]');
    await expect(page).toHaveURL('**/dashboard');
  });

  test('should search functionality work', async ({ page }) => {
    await page.click('[data-testid="search-button"]');
    await page.fill('[data-testid="search-input"]', 'test project');
    await page.press('[data-testid="search-input"]', 'Enter');
    
    await expect(page.locator('[data-testid="search-results"]')).toBeVisible();
    await expect(page.locator('[data-testid="search-result-item"]').first()).toBeVisible();
  });

  test('should toggle sidebar collapse', async ({ page }) => {
    await page.click('[data-testid="sidebar-toggle"]');
    await expect(page.locator('[data-testid="sidebar"]')).toHaveClass(/collapsed/);
    
    await page.click('[data-testid="sidebar-toggle"]');
    await expect(page.locator('[data-testid="sidebar"]')).not.toHaveClass(/collapsed/);
  });

  test('should display notifications', async ({ page }) => {
    await page.click('[data-testid="notification-bell"]');
    await expect(page.locator('[data-testid="notification-dropdown"]')).toBeVisible();
    
    const notifications = page.locator('[data-testid="notification-item"]');
    await expect(notifications.first()).toBeVisible();
  });

  test('should mark notification as read', async ({ page }) => {
    await page.click('[data-testid="notification-bell"]');
    await page.click('[data-testid="notification-item"]').first();
    await expect(page.locator('[data-testid="notification-item"]').first()).not.toHaveClass(/unread/);
  });

  test('should refresh dashboard data', async ({ page }) => {
    await page.click('[data-testid="refresh-button"]');
    await expect(page.locator('[data-testid="loading-spinner"]')).toBeVisible();
    await expect(page.locator('[data-testid="loading-spinner"]')).toBeHidden();
    await expect(page.locator('[data-testid="dashboard"]')).toBeVisible();
  });

  test('should handle quick actions', async ({ page }) => {
    await page.click('[data-testid="quick-action-create"]');
    await expect(page.locator('[data-testid="create-modal"]')).toBeVisible();
    
    await page.fill('[data-testid="create-input"]', 'New Item');
    await page.click('[data-testid="create-submit"]');
    await expect(page.locator('[data-testid="success-toast"]')).toBeVisible();
  });

  test('should display chart widgets', async ({ page }) => {
    await expect(page.locator('[data-testid="chart-performance"]')).toBeVisible();
    await expect(page.locator('[data-testid="chart-usage"]')).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(2);
  });

  test('should handle date range picker', async ({ page }) => {
    await page.click('[data-testid="date-range-picker"]');
    await page.click('[data-testid="date-option-last7days"]');
    await expect(page.locator('[data-testid="date-range-picker"]')).toContainText('Last 7 days');
    
    // Verify charts update
    await expect(page.locator('[data-testid="chart-performance"]')).toBeVisible();
  });
});
