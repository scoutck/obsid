import { test, expect } from "@playwright/test";

test.describe("Chat Mode Flow", () => {
  test("switch to chat mode — mode transition audit", async ({ page }) => {
    await page.goto("/");
    const editor = page.locator(".cm-editor .cm-content");
    await expect(editor).toBeVisible({ timeout: 10000 });
    await editor.click();

    await page.screenshot({ path: "tests/e2e/results/09-before-chatmode.png", fullPage: true });

    // Type /chatmode
    await page.keyboard.type("/chatmode");
    const slashMenu = page.locator("[class*='slash-menu'], [data-slash-menu]").first();
    await expect(slashMenu).toBeVisible({ timeout: 5000 });
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1000);

    await page.screenshot({ path: "tests/e2e/results/10-chatmode-entered.png", fullPage: true });

    // PM: Is the mode transition clear? Does the user know they're in chat?
    // PM: Can they get back to notes easily? Is the exit path obvious?
    // UX: Visual differentiation — does chat look distinct from note editing?
    // UX: Is there a loading state during transition?
    // UX: Feedback loop — did the UI confirm the mode switch?
  });

  test("switch back to note mode — return path audit", async ({ page }) => {
    await page.goto("/");
    const editor = page.locator(".cm-editor .cm-content");
    await expect(editor).toBeVisible({ timeout: 10000 });
    await editor.click();

    // Enter chat mode
    await page.keyboard.type("/chatmode");
    const slashMenu = page.locator("[class*='slash-menu'], [data-slash-menu]").first();
    await expect(slashMenu).toBeVisible({ timeout: 5000 });
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1000);

    await page.screenshot({ path: "tests/e2e/results/11-in-chatmode.png", fullPage: true });

    // Try to switch back — look for a way to invoke /notemode
    // The chat view should have its own input area
    // PM: Is the return path discoverable without documentation?
    // PM: What's the cost of a user accidentally entering chat mode?
  });
});
