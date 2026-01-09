import { test, expect } from '@playwright/test';

test.describe('Calendar Puzzle Clickable Cells', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for initial puzzle to be solved
    await page.waitForSelector('.status', { timeout: 10000 });
    await page.waitForTimeout(2000); // Give solver time to complete
  });

  test('should allow clicking on empty month cells after puzzle is solved', async ({ page }) => {
    // Get the initial selected month from the target cell
    const initialMonth = await page.locator('.cell.target').filter({ hasText: /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/ }).textContent();

    // Find an empty month cell (not the currently selected one)
    // Month cells are in the first two rows (rows 0-1)
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    let targetMonth = monthNames.find(m => m !== initialMonth) || 'Feb';

    // Click on the target month cell (looking in pieces that have the month label)
    const monthCell = page.locator('.cell').filter({ hasText: new RegExp(`^${targetMonth}$`) }).first();
    await monthCell.click();

    // Wait for the puzzle to be solved again
    await page.waitForSelector('.status.success', { timeout: 10000 });

    // Verify the month has changed
    const newMonth = await page.locator('.cell.target').filter({ hasText: /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/ }).textContent();
    expect(newMonth).toBe(targetMonth);
  });

  test('should allow clicking on empty day cells after puzzle is solved', async ({ page }) => {
    // Get the initial selected day from the target cell
    const initialDayText = await page.locator('.cell.target').filter({ hasText: /^\d+$/ }).textContent();
    const initialDay = parseInt(initialDayText || '1');

    // Find a different day to click on
    const targetDay = initialDay === 1 ? 15 : 10;

    // Click on the target day cell
    const dayCell = page.locator('.cell').filter({ hasText: new RegExp(`^${targetDay}$`) }).first();
    await dayCell.click();

    // Wait for the puzzle to be solved again
    await page.waitForSelector('.status.success', { timeout: 10000 });

    // Verify the day has changed
    const newDayText = await page.locator('.cell.target').filter({ hasText: /^\d+$/ }).textContent();
    expect(parseInt(newDayText || '0')).toBe(targetDay);
  });

  test('should cycle to next month when clicking on current month target cell', async ({ page }) => {
    // Get the initial selected month
    const initialMonth = await page.locator('.cell.target').filter({ hasText: /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/ }).textContent();

    // Click on the target month cell (the black one)
    const targetMonthCell = page.locator('.cell.target').filter({ hasText: new RegExp(`^${initialMonth}$`) });
    await targetMonthCell.click();

    // Wait for the puzzle to be solved again
    await page.waitForSelector('.status.success', { timeout: 10000 });

    // Verify the month has changed to the next one
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const initialIndex = monthNames.indexOf(initialMonth || 'Jan');
    const expectedNextMonth = monthNames[(initialIndex + 1) % 12];

    const newMonth = await page.locator('.cell.target').filter({ hasText: /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/ }).textContent();
    expect(newMonth).toBe(expectedNextMonth);
  });

  test('should cycle to next day when clicking on current day target cell', async ({ page }) => {
    // Get the initial selected day
    const initialDayText = await page.locator('.cell.target').filter({ hasText: /^\d+$/ }).textContent();
    const initialDay = parseInt(initialDayText || '1');

    // Click on the target day cell (the black one)
    const targetDayCell = page.locator('.cell.target').filter({ hasText: new RegExp(`^${initialDay}$`) });
    await targetDayCell.click();

    // Wait for the puzzle to be solved again
    await page.waitForSelector('.status.success', { timeout: 10000 });

    // Verify the day has changed to the next one
    const expectedNextDay = (initialDay % 31) + 1;

    const newDayText = await page.locator('.cell.target').filter({ hasText: /^\d+$/ }).textContent();
    expect(parseInt(newDayText || '0')).toBe(expectedNextDay);
  });

  test('should handle multiple clicks on different cells', async ({ page }) => {
    // Click on Feb
    await page.locator('.cell').filter({ hasText: /^Feb$/ }).first().click();
    await page.waitForSelector('.status.success', { timeout: 10000 });

    let month = await page.locator('.cell.target').filter({ hasText: /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/ }).textContent();
    expect(month).toBe('Feb');

    // Click on day 14
    await page.locator('.cell').filter({ hasText: /^14$/ }).first().click();
    await page.waitForSelector('.status.success', { timeout: 10000 });

    let day = await page.locator('.cell.target').filter({ hasText: /^\d+$/ }).textContent();
    expect(day).toBe('14');

    // Click on Mar
    await page.locator('.cell').filter({ hasText: /^Mar$/ }).first().click();
    await page.waitForSelector('.status.success', { timeout: 10000 });

    month = await page.locator('.cell.target').filter({ hasText: /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/ }).textContent();
    expect(month).toBe('Mar');

    // Verify day is still 14
    day = await page.locator('.cell.target').filter({ hasText: /^\d+$/ }).textContent();
    expect(day).toBe('14');
  });
});
