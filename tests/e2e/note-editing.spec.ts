import { test, expect } from "@playwright/test";

test.describe("Note Editing Flow", () => {
  test("initial page load — first impression audit", async ({ page }) => {
    await page.goto("/");
    await page.screenshot({ path: "tests/e2e/results/01-initial-load.png", fullPage: true });

    // FUNCTIONAL: editor loads
    const editor = page.locator(".cm-editor");
    await expect(editor).toBeVisible({ timeout: 10000 });

    // PM: Is the happy path obvious within 3 seconds?
    // PM: What job-to-be-done is this screen serving? (Write/edit notes)
    // UX: Information hierarchy — is the editor the most prominent element?
    // UX: Cognitive load — how many decisions is the user asked to make on first load?
    // UX: Is there any onboarding cue or is the user dropped into a blank editor?
  });

  test("typing in editor — core interaction", async ({ page }) => {
    await page.goto("/");
    const editor = page.locator(".cm-editor .cm-content");
    await expect(editor).toBeVisible({ timeout: 10000 });
    await editor.click();
    await page.keyboard.type("# Meeting Notes\n\nDiscussed the project timeline with Sarah.");
    await page.screenshot({ path: "tests/e2e/results/02-typing-content.png", fullPage: true });

    await expect(editor).toContainText("Meeting Notes");
    await expect(editor).toContainText("Sarah");

    // UX: Does the editor feel responsive? Any lag?
    // UX: Is the font readable? Appropriate size and contrast?
    // UX: Does markdown preview kick in (heading formatting)?
  });

  test("markdown preview — unfocused line hides markers", async ({ page }) => {
    await page.goto("/");
    const editor = page.locator(".cm-editor .cm-content");
    await expect(editor).toBeVisible({ timeout: 10000 });
    await editor.click();
    await page.keyboard.type("# My Heading");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Body text below the heading");
    await page.screenshot({ path: "tests/e2e/results/03-markdown-preview.png", fullPage: true });

    // FUNCTIONAL: heading line should hide # marker when cursor is on body line
    // UX: Is the preview behavior obvious? Does the user understand what happened?
    // UX: Is there visual differentiation between heading and body text?
  });

  test("slash menu — discoverability and interaction", async ({ page }) => {
    await page.goto("/");
    const editor = page.locator(".cm-editor .cm-content");
    await expect(editor).toBeVisible({ timeout: 10000 });
    await editor.click();
    await page.keyboard.type("/");
    await page.screenshot({ path: "tests/e2e/results/04-slash-menu-open.png", fullPage: true });

    const slashMenu = page.locator("[class*='slash-menu'], [data-slash-menu]").first();
    await expect(slashMenu).toBeVisible({ timeout: 5000 });

    // PM: Is the slash menu discoverable? Would a new user know to type /?
    // PM: Where would a user drop off here — too many options? Unclear labels?
    // UX: Cognitive load — how many commands are shown? Is it overwhelming?
    // UX: Affordances — do menu items look clickable? Is there hover state?
    // UX: Is the menu positioned correctly relative to cursor?

    // Filter the menu
    await page.keyboard.type("bo");
    await page.screenshot({ path: "tests/e2e/results/05-slash-menu-filtered.png", fullPage: true });
    await expect(slashMenu).toContainText(/bold/i);

    // UX: Does filtering feel instant? Is the match highlighting clear?
    // UX: What happens with no matches — is there a "no results" message?
  });

  test("slash menu — escape dismissal", async ({ page }) => {
    await page.goto("/");
    const editor = page.locator(".cm-editor .cm-content");
    await expect(editor).toBeVisible({ timeout: 10000 });
    await editor.click();
    await page.keyboard.type("/");
    const slashMenu = page.locator("[class*='slash-menu'], [data-slash-menu]").first();
    await expect(slashMenu).toBeVisible({ timeout: 5000 });
    await page.keyboard.press("Escape");
    await page.screenshot({ path: "tests/e2e/results/06-slash-menu-dismissed.png", fullPage: true });
    await expect(slashMenu).not.toBeVisible({ timeout: 3000 });

    // PM: Can the user recover from opening the menu accidentally?
    // UX: Is the "/" character left behind after escape? Clean state?
  });

  test("slash menu — command execution (bold)", async ({ page }) => {
    await page.goto("/");
    const editor = page.locator(".cm-editor .cm-content");
    await expect(editor).toBeVisible({ timeout: 10000 });
    await editor.click();
    await page.keyboard.type("make me bold");
    // Select all text
    await page.keyboard.press("Home");
    await page.keyboard.press("Shift+End");
    await page.screenshot({ path: "tests/e2e/results/07-text-selected.png", fullPage: true });

    // Deselect and type slash command
    await page.keyboard.press("End");
    await page.keyboard.type("/bold");
    const slashMenu = page.locator("[class*='slash-menu'], [data-slash-menu]").first();
    await expect(slashMenu).toBeVisible({ timeout: 5000 });
    await page.keyboard.press("Enter");
    await page.screenshot({ path: "tests/e2e/results/08-bold-applied.png", fullPage: true });

    // UX: Feedback loop — does the user see confirmation that bold was applied?
    // UX: Does the formatting look correct in the editor?
    // PM: Is the cost of a user error here low? Can they undo?
  });
});
