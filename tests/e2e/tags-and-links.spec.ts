import { test, expect } from "@playwright/test";

test.describe("Tags and Wiki-Links", () => {
  test("tag autocomplete — # trigger audit", async ({ page }) => {
    await page.goto("/");
    const editor = page.locator(".cm-editor .cm-content");
    await expect(editor).toBeVisible({ timeout: 10000 });
    await editor.click();

    await page.keyboard.type("Working on the ");
    await page.keyboard.type("#");
    await page.waitForTimeout(500);
    await page.screenshot({ path: "tests/e2e/results/12-tag-trigger.png", fullPage: true });

    // UX: Does a tag autocomplete menu appear?
    // UX: Is the # visually styled differently (tag syntax highlighting)?
    // PM: Is the tag system discoverable?

    await page.keyboard.type("project");
    await page.screenshot({ path: "tests/e2e/results/13-tag-typed.png", fullPage: true });

    // UX: Is the tag visually distinct from regular text?
    // UX: Does the autocomplete help or get in the way?
  });

  test("wiki-link — [[ trigger audit", async ({ page }) => {
    await page.goto("/");
    const editor = page.locator(".cm-editor .cm-content");
    await expect(editor).toBeVisible({ timeout: 10000 });
    await editor.click();

    await page.keyboard.type("See also [[");
    await page.waitForTimeout(500);
    await page.screenshot({ path: "tests/e2e/results/14-wikilink-trigger.png", fullPage: true });

    await page.keyboard.type("Meeting Notes]]");
    await page.screenshot({ path: "tests/e2e/results/15-wikilink-complete.png", fullPage: true });

    // UX: Is the wiki-link visually decorated (different from plain text)?
    // UX: Does it look clickable? Does the affordance match the action?
    // PM: What happens if the linked note doesn't exist? Error? Create prompt?
  });

  test("empty editor — zero state audit", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(2000);
    await page.screenshot({ path: "tests/e2e/results/16-zero-state.png", fullPage: true });

    // PM: What does a brand new user see? Is there guidance?
    // PM: Is the happy path obvious within 3 seconds? (Start typing)
    // UX: Is there placeholder text or an empty state message?
    // UX: Cognitive load — how many things compete for attention?
    // UX: Accessibility — is there any screen reader guidance?
  });
});
