import type { Locator, Page } from 'playwright';

export const SCREENSHOT_SANITIZATION_UNCONFIRMED = 'SCREENSHOT_SANITIZATION_UNCONFIRMED';
export type SensitiveRegion = 'documentNumber' | 'name' | 'revenue' | 'barcode';
export type ScreenshotLocators = Record<SensitiveRegion, Locator>;

/** Captures only after all required sensitive regions are locatable and visible. */
export async function captureSanitizedScreenshot(page: Page, locators: ScreenshotLocators): Promise<Buffer> {
  const regions = Object.values(locators);
  const confirmed = regions.length === 4 && (await Promise.all(regions.map(async (locator) => {
    if (await locator.count() !== 1) return false;
    return locator.isVisible();
  }))).every(Boolean);
  if (!confirmed) throw new Error(SCREENSHOT_SANITIZATION_UNCONFIRMED);
  return page.screenshot({ type: 'png', animations: 'disabled', mask: regions, maskColor: '#000000' });
}
