import { test, expect } from '@playwright/test';

/**
 * UX Screenshot Capture Suite
 *
 * This test suite captures comprehensive screenshots of the Notes application
 * for UX analysis. Screenshots are saved to the screenshots/ directory and
 * can be analyzed by Claude for UX improvements.
 *
 * Run with: npx playwright test ux-screenshots.spec.ts --headed
 */

test.describe('Notes App UX Screenshots', () => {
  const baseURL = 'http://localhost:8000';

  test.beforeEach(async ({ page }) => {
    // Set a reasonable viewport for desktop screenshots
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  test('01 - Login page (desktop)', async ({ page }) => {
    await page.goto(baseURL);

    // Wait for page to be fully loaded
    await page.waitForLoadState('networkidle');

    await page.screenshot({
      path: 'screenshots/01-login-desktop.png',
      fullPage: true
    });
  });

  test('02 - Login page (mobile)', async ({ page }) => {
    // iPhone 12 Pro dimensions
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto(baseURL);
    await page.waitForLoadState('networkidle');

    await page.screenshot({
      path: 'screenshots/02-login-mobile.png',
      fullPage: true
    });
  });

  test('03 - Main app view (if accessible)', async ({ page }) => {
    await page.goto(baseURL);

    // Try to access main app (may require authentication)
    // This will capture whatever state the app shows
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000); // Wait for any animations

    await page.screenshot({
      path: 'screenshots/03-main-view-desktop.png',
      fullPage: true
    });
  });

  test('04 - Main app view mobile (if accessible)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto(baseURL);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    await page.screenshot({
      path: 'screenshots/04-main-view-mobile.png',
      fullPage: true
    });
  });

  test('05 - Tablet view', async ({ page }) => {
    // iPad dimensions
    await page.setViewportSize({ width: 768, height: 1024 });

    await page.goto(baseURL);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    await page.screenshot({
      path: 'screenshots/05-tablet-view.png',
      fullPage: true
    });
  });

  test('06 - Component screenshots (if visible)', async ({ page }) => {
    await page.goto(baseURL);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Try to capture individual components if they're visible
    const components = [
      { selector: 'notes-app', name: '06a-notes-app-component' },
      { selector: 'note-editor', name: '06b-note-editor-component' },
      { selector: 'note-list', name: '06c-note-list-component' },
      { selector: 'search-bar', name: '06d-search-bar-component' },
      { selector: 'tag-manager', name: '06e-tag-manager-component' }
    ];

    for (const { selector, name } of components) {
      try {
        const element = page.locator(selector).first();
        if (await element.isVisible({ timeout: 2000 })) {
          await element.screenshot({
            path: `screenshots/${name}.png`
          });
        }
      } catch (e) {
        // Component not visible, skip
        console.log(`Component ${selector} not visible`);
      }
    }
  });

  test('07 - Dark mode check', async ({ page }) => {
    await page.goto(baseURL);
    await page.waitForLoadState('networkidle');

    // Try to enable dark mode if the feature exists
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.waitForTimeout(500);

    await page.screenshot({
      path: 'screenshots/07-dark-mode.png',
      fullPage: true
    });
  });

  test('08 - Responsive breakpoints', async ({ page }) => {
    const viewports = [
      { width: 320, height: 568, name: '08a-mobile-small' },      // iPhone SE
      { width: 375, height: 667, name: '08b-mobile-medium' },     // iPhone 8
      { width: 414, height: 896, name: '08c-mobile-large' },      // iPhone 11 Pro Max
      { width: 768, height: 1024, name: '08d-tablet' },           // iPad
      { width: 1024, height: 768, name: '08e-tablet-landscape' }, // iPad landscape
      { width: 1440, height: 900, name: '08f-desktop-large' }     // Desktop
    ];

    for (const { width, height, name } of viewports) {
      await page.setViewportSize({ width, height });
      await page.goto(baseURL);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(500);

      await page.screenshot({
        path: `screenshots/${name}.png`,
        fullPage: true
      });
    }
  });

  test('09 - Accessibility inspection', async ({ page }) => {
    await page.goto(baseURL);
    await page.waitForLoadState('networkidle');

    // Take screenshot for accessibility review
    await page.screenshot({
      path: 'screenshots/09-accessibility-review.png',
      fullPage: true
    });

    // Log accessibility tree for analysis
    const snapshot = await page.accessibility.snapshot();
    console.log('Accessibility tree:', JSON.stringify(snapshot, null, 2));
  });

  test('10 - Performance and loading states', async ({ page }) => {
    // Capture loading state
    const loadingPromise = page.goto(baseURL);

    // Try to capture loading state (may be too fast)
    await page.waitForTimeout(100);
    try {
      await page.screenshot({
        path: 'screenshots/10a-loading-state.png'
      });
    } catch (e) {
      // Loading too fast, that's okay
    }

    await loadingPromise;
    await page.waitForLoadState('networkidle');

    // Capture loaded state
    await page.screenshot({
      path: 'screenshots/10b-loaded-state.png',
      fullPage: true
    });
  });
});
