import { test, expect, Page } from '@playwright/test';
import path from 'path';

test.describe('Admin Dashboard Flow', () => {
  let page: Page;

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
    await page.goto('/');
  });

  test.afterEach(async () => {
    await page.close();
  });

  test('should complete full area import and build workflow', async () => {
    // Step 1: Login with Google
    await test.step('Login', async () => {
      await page.click('button:has-text("Sign in with Google")');
      // Handle Google OAuth flow (mocked in test environment)
      await page.waitForURL('/dashboard');
      expect(await page.title()).toContain('ScanNeo Admin');
    });

    // Step 2: Navigate to import area
    await test.step('Navigate to import', async () => {
      await page.click('a:has-text("Import Area")');
      await page.waitForSelector('h1:has-text("Import Coverage Area")');
    });

    // Step 3: Upload GeoJSON file
    await test.step('Upload GeoJSON', async () => {
      const fileInput = await page.locator('input[type="file"]');
      const testFile = path.join(__dirname, '../fixtures/tower-hamlets.geojson');
      await fileInput.setInputFiles(testFile);

      // Verify preview map shows the polygon
      await page.waitForSelector('.mapboxgl-canvas');
      const mapVisible = await page.isVisible('[data-testid="map-preview"]');
      expect(mapVisible).toBe(true);
    });

    // Step 4: Configure import settings
    await test.step('Configure settings', async () => {
      // Set buffer
      await page.fill('input[name="buffer"]', '50');

      // Select profile
      await page.selectOption('select[name="profile"]', 'driving-car');

      // Toggle service roads
      await page.click('input[name="includeService"]');

      // Set chunk duration
      await page.fill('input[name="chunkDuration"]', '900');
    });

    // Step 5: Submit import
    await test.step('Submit import', async () => {
      await page.click('button:has-text("Start Import")');

      // Wait for success message
      await page.waitForSelector('[role="alert"]:has-text("Import started successfully")');

      // Should redirect to job progress
      await page.waitForURL(/\/jobs\/[a-f0-9-]+/);
    });

    // Step 6: Monitor job progress
    await test.step('Monitor progress', async () => {
      // Check progress indicators
      await expect(page.locator('[data-testid="progress-extraction"]')).toBeVisible();
      await expect(page.locator('[data-testid="progress-graph"]')).toBeVisible();
      await expect(page.locator('[data-testid="progress-coverage"]')).toBeVisible();
      await expect(page.locator('[data-testid="progress-routing"]')).toBeVisible();
      await expect(page.locator('[data-testid="progress-chunking"]')).toBeVisible();

      // Wait for completion (with timeout for CI)
      await page.waitForSelector('[data-testid="job-status"]:has-text("Completed")', {
        timeout: 120000,
      });
    });

    // Step 7: View results
    await test.step('View results', async () => {
      await page.click('a:has-text("View Route")');

      // Check route details
      await expect(page.locator('[data-testid="route-length"]')).toContainText('km');
      await expect(page.locator('[data-testid="route-duration"]')).toContainText('hours');
      await expect(page.locator('[data-testid="chunk-count"]')).toContainText('chunks');
    });

    // Step 8: Download GPX
    await test.step('Download GPX', async () => {
      const downloadPromise = page.waitForEvent('download');
      await page.click('button:has-text("Download GPX")');
      const download = await downloadPromise;

      expect(download.suggestedFilename()).toMatch(/chunk-\d+\.gpx/);

      // Verify download content
      const content = await download.path();
      expect(content).toBeTruthy();
    });
  });

  test('should handle import errors gracefully', async () => {
    await page.goto('/import');

    // Try to submit without file
    await page.click('button:has-text("Start Import")');

    // Should show validation error
    await expect(page.locator('[role="alert"]:has-text("Please select a file")')).toBeVisible();
  });

  test('should display coverage statistics', async () => {
    await page.goto('/dashboard');

    // Check dashboard stats
    await expect(page.locator('[data-testid="total-areas"]')).toBeVisible();
    await expect(page.locator('[data-testid="total-routes"]')).toBeVisible();
    await expect(page.locator('[data-testid="coverage-percentage"]')).toBeVisible();
  });

  test('should filter and search routes', async () => {
    await page.goto('/routes');

    // Search by area name
    await page.fill('input[placeholder="Search areas..."]', 'Tower Hamlets');
    await page.press('input[placeholder="Search areas..."]', 'Enter');

    // Verify filtered results
    const results = await page.locator('[data-testid="route-item"]').count();
    expect(results).toBeGreaterThan(0);
  });
});
