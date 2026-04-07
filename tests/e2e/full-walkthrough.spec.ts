import { test, expect } from "@playwright/test";

test.describe("Full User Journey — PM/UX Walkthrough", () => {
  test("complete note-taking session", async ({ page }) => {
    // Step 1: Land on app
    await page.goto("/");
    await page.screenshot({ path: "tests/e2e/results/walk-01-landing.png", fullPage: true });

    const editor = page.locator(".cm-editor .cm-content");
    await expect(editor).toBeVisible({ timeout: 10000 });

    // Step 2: Create first note with content
    await editor.click();
    await page.keyboard.type("# Project Kickoff\n\nMet with Sarah and Bob to discuss the new feature. Key decisions:\n\n- Launch date is April 15\n- Bob will handle backend\n- Sarah owns the design\n\n#meeting #project");
    await page.screenshot({ path: "tests/e2e/results/walk-02-note-written.png", fullPage: true });

    // Step 3: Try to create a new note via slash command
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await page.keyboard.type("/new");
    await page.waitForTimeout(500);
    await page.screenshot({ path: "tests/e2e/results/walk-03-new-note-cmd.png", fullPage: true });

    // Step 4: Try the /notes command to see note list
    // First dismiss any open menu
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    // Clear the /new text
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Backspace");
    await page.keyboard.type("/notes");
    await page.waitForTimeout(500);
    await page.screenshot({ path: "tests/e2e/results/walk-04-notes-list-cmd.png", fullPage: true });

    // PM EVALUATION at each step:
    // - User emotional state: confident? confused? anxious?
    // - Friction points: anything that made them pause, guess, or backtrack?
    // - Pattern consistency: do similar actions work the same way?
    // - Error recovery: what happens if they make a mistake?
  });
});
