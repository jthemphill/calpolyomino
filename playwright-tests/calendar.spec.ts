import { test, expect } from "@playwright/test";

test.describe("Calendar Puzzle Clickable Cells", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for initial puzzle to be solved
    await page.waitForSelector(".status", { timeout: 10000 });
    await page.waitForTimeout(2000); // Give solver time to complete
  });

  test("should allow clicking on empty month cells after puzzle is solved", async ({
    page,
  }) => {
    // Get the initial selected month using accessibility API
    const currentMonthButton = page
      .getByRole("button", { pressed: true })
      .filter({
        hasText: /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/,
      });
    const initialMonth = await currentMonthButton.textContent();

    // Find a different month to click on
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    let targetMonth = monthNames.find((m) => m !== initialMonth) || "Feb";

    // Click on the target month using accessibility label
    await page
      .getByRole("button", { name: `Select month ${targetMonth}` })
      .first()
      .click();

    // Wait for the puzzle to be solved again
    await page.waitForSelector(".status.success", { timeout: 10000 });

    // Verify the month has changed
    const newMonthButton = page.getByRole("button", {
      name: new RegExp(`Current month: ${targetMonth}`),
    });
    await expect(newMonthButton).toBeVisible();
  });

  test("should allow clicking on empty day cells after puzzle is solved", async ({
    page,
  }) => {
    // Get the initial selected day using accessibility API
    const currentDayButton = page
      .getByRole("button", { pressed: true })
      .filter({ hasText: /^\d+$/ });
    const initialDayText = await currentDayButton.textContent();
    const initialDay = parseInt(initialDayText || "1");

    // Find a different day to click on
    const targetDay = initialDay === 1 ? 15 : 10;

    // Click on the target day using accessibility label
    await page
      .getByRole("button", { name: `Select day ${targetDay}` })
      .first()
      .click();

    // Wait for the puzzle to be solved again
    await page.waitForSelector(".status.success", { timeout: 10000 });

    // Verify the day has changed
    const newDayButton = page.getByRole("button", {
      name: new RegExp(`Current day: ${targetDay}`),
    });
    await expect(newDayButton).toBeVisible();
  });

  test("should cycle to next month when clicking on current month target cell", async ({
    page,
  }) => {
    // Get the initial selected month using accessibility API
    const currentMonthButton = page
      .getByRole("button", { pressed: true })
      .filter({
        hasText: /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/,
      });
    const initialMonth = await currentMonthButton.textContent();

    // Click on the current month button to cycle to next month
    await currentMonthButton.click();

    // Wait for the puzzle to be solved again
    await page.waitForSelector(".status.success", { timeout: 10000 });

    // Verify the month has changed to the next one
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const initialIndex = monthNames.indexOf(initialMonth || "Jan");
    const expectedNextMonth = monthNames[(initialIndex + 1) % 12];

    const newMonthButton = page.getByRole("button", {
      name: new RegExp(`Current month: ${expectedNextMonth}`),
    });
    await expect(newMonthButton).toBeVisible();
  });

  test("should cycle to next day when clicking on current day target cell", async ({
    page,
  }) => {
    // Get the initial selected day using accessibility API
    const currentDayButton = page
      .getByRole("button", { pressed: true })
      .filter({ hasText: /^\d+$/ });
    const initialDayText = await currentDayButton.textContent();
    const initialDay = parseInt(initialDayText || "1");

    // Click on the current day button to cycle to next day
    await currentDayButton.click();

    // Wait for the puzzle to be solved again
    await page.waitForSelector(".status.success", { timeout: 10000 });

    // Verify the day has changed to the next one
    const expectedNextDay = (initialDay % 31) + 1;

    const newDayButton = page.getByRole("button", {
      name: new RegExp(`Current day: ${expectedNextDay}`),
    });
    await expect(newDayButton).toBeVisible();
  });

  test("should handle multiple clicks on different cells", async ({ page }) => {
    // Click on Feb using accessibility label
    await page
      .getByRole("button", { name: "Select month Feb" })
      .first()
      .click();
    await page.waitForSelector(".status.success", { timeout: 10000 });

    // Verify Feb is now selected
    await expect(
      page.getByRole("button", { name: /Current month: Feb/ })
    ).toBeVisible();

    // Click on day 14 using accessibility label
    await page.getByRole("button", { name: "Select day 14" }).first().click();
    await page.waitForSelector(".status.success", { timeout: 10000 });

    // Verify day 14 is now selected
    await expect(
      page.getByRole("button", { name: /Current day: 14/ })
    ).toBeVisible();

    // Click on Mar using accessibility label
    await page
      .getByRole("button", { name: "Select month Mar" })
      .first()
      .click();
    await page.waitForSelector(".status.success", { timeout: 10000 });

    // Verify Mar is now selected
    await expect(
      page.getByRole("button", { name: /Current month: Mar/ })
    ).toBeVisible();

    // Verify day is still 14
    await expect(
      page.getByRole("button", { name: /Current day: 14/ })
    ).toBeVisible();
  });

  test("should support keyboard navigation and activation", async ({
    page,
  }) => {
    // Find a month cell to interact with via keyboard
    const febButton = page
      .getByRole("button", { name: "Select month Feb" })
      .first();

    // Focus the button using Tab (simulate keyboard navigation)
    await febButton.focus();

    // Verify it has focus (check for focus outline)
    await expect(febButton).toBeFocused();

    // Activate with Enter key
    await febButton.press("Enter");
    await page.waitForSelector(".status.success", { timeout: 10000 });

    // Verify Feb is now selected
    await expect(
      page.getByRole("button", { name: /Current month: Feb/ })
    ).toBeVisible();

    // Find day 20 and activate with Space key
    const day20Button = page
      .getByRole("button", { name: "Select day 20" })
      .first();
    await day20Button.focus();
    await day20Button.press(" "); // Space key
    await page.waitForSelector(".status.success", { timeout: 10000 });

    // Verify day 20 is now selected
    await expect(
      page.getByRole("button", { name: /Current day: 20/ })
    ).toBeVisible();
  });
});
