import { expect, test } from "@playwright/test";

// Runs against tests/e2e/seed.sql: organisation "E2E" with two notices and one award.

test("searching from the home page shows matching slips", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("searchbox").fill("φαρμάκων δοκιμής e2e");
  await page.getByRole("button", { name: "Αναζήτηση" }).click();

  await expect(page).toHaveURL(/\/search\?q=/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("αποτελέσματα");
  await expect(page.getByRole("link", { name: "ΠΡΟΜΗΘΕΙΑ ΦΑΡΜΑΚΩΝ ΔΟΚΙΜΗΣ E2E" })).toBeVisible();
});

test("filters leave empty fields out of the URL and narrow the results", async ({ page }) => {
  await page.goto("/search?organisation=E2E");
  // The picker replaces the plain list once scripts have loaded; wait for it.
  await page.locator("input[role=combobox]").click();
  await page.getByRole("option", { name: /^Υπηρεσίες λυμάτων/ }).click();
  await page.getByRole("button", { name: "Αναζήτηση" }).click();

  await expect(page).toHaveURL(/\/search\?organisation=E2E&cpv=90$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^1 αποτέλεσμα/);
  await expect(page.getByRole("link", { name: "ΚΑΘΑΡΙΣΜΟΣ ΣΧΟΛΕΙΩΝ ΔΟΚΙΜΗΣ E2E" })).toBeVisible();
});

test("sorting by amount puts the largest first", async ({ page }) => {
  await page.goto("/search?organisation=E2E&sort=amount");

  await expect(page.locator("ol > li").first()).toContainText(/80\.000/);
});

test("an open tender shows its countdown and the record page its chain", async ({ page }) => {
  await page.goto("/search?organisation=E2E&sort=deadline");
  await expect(page.locator("ol li").first()).toContainText(/\d+ ημέρες ·/);

  await page.goto("/items/26AWRD999000002");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("ΑΝΑΘΕΣΗ ΦΑΡΜΑΚΩΝ ΔΟΚΙΜΗΣ E2E");
  await expect(page.getByText("Πορεία της προμήθειας")).toBeVisible();
  await expect(page.getByRole("link", { name: "ΠΡΟΜΗΘΕΙΑ ΦΑΡΜΑΚΩΝ ΔΟΚΙΜΗΣ E2E" })).toBeVisible();
});

test("the organisation page lists its top contractors", async ({ page }) => {
  await page.goto("/organisations/E2E");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("ΔΗΜΟΣ ΔΟΚΙΜΩΝ E2E");
  await expect(page.getByText("ΦΑΡΜΑΚΑΠΟΘΗΚΗ E2E Α.Ε.")).toBeVisible();
});

test("keyboard users can skip to the content", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");

  const skip = page.getByRole("link", { name: "Μετάβαση στο περιεχόμενο" });
  await expect(skip).toBeFocused();
  await skip.press("Enter");
  await expect(page).toHaveURL(/#main$/);
});

test("alerts ask visitors to sign in first", async ({ page }) => {
  await page.goto("/account");

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel("Email")).toBeVisible();
});

test("English pages keep the records in Greek", async ({ page }) => {
  await page.goto("/en/items/26PROC999000001");

  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByText("Procurement chain")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("ΠΡΟΜΗΘΕΙΑ ΦΑΡΜΑΚΩΝ ΔΟΚΙΜΗΣ E2E");
});
