import { test, expect } from "@playwright/test";
import { card, catalogMatches } from "../test/fixtures.js";

// Walks the full customer journey through the Deck Brewer matrix and
// captures the screenshots embedded in pull request descriptions
// (docs/screenshots/).
//
// Scryfall responses are stubbed at the network layer so the run is
// deterministic and works offline. Set SCRYFALL_LIVE=1 to skip the stubs
// and exercise the real API (subject to rate limits and data drift).

const SCREENSHOT_DIR = "docs/screenshots";

const CARD_DATA = {
  "Sol Ring": { mana_cost: "{1}", type_line: "Artifact", cmc: 1, color_identity: [] },
  "Swords to Plowshares": { mana_cost: "{W}", type_line: "Instant", cmc: 1, color_identity: ["W"] },
  Counterspell: { mana_cost: "{U}{U}", type_line: "Instant", cmc: 2, color_identity: ["U"] },
  Cultivate: { mana_cost: "{2}{G}", type_line: "Sorcery", cmc: 3, color_identity: ["G"] },
};

const named = (name) => card(name, CARD_DATA[name] ?? { cmc: 1 });

async function stubScryfall(page) {
  await page.route("https://api.scryfall.com/**", async (route) => {
    // Match against the decoded URL: the app encodes "otag:ramp" as
    // "otag%3Aramp", which naive matching silently misses.
    const url = decodeURIComponent(route.request().url());
    if (url.includes("/cards/autocomplete")) {
      return route.fulfill({ json: { data: catalogMatches(url.split("q=")[1]) } });
    }
    if (url.includes("fuzzy=Atraxa")) {
      return route.fulfill({
        json: card("Atraxa, Praetors' Voice", {
          mana_cost: "{G}{W}{U}{B}",
          type_line: "Legendary Creature — Phyrexian Angel Horror",
          cmc: 4,
          color_identity: ["W", "U", "B", "G"],
        }),
      });
    }
    if (url.includes("/cards/collection")) {
      const { identifiers } = route.request().postDataJSON();
      await new Promise((r) => setTimeout(r, 600)); // keep the loading state visible
      return route.fulfill({
        json: { data: identifiers.map(({ name }) => named(name)), not_found: [] },
      });
    }
    if (url.includes("/cards/search")) {
      const q = url.split("?q=")[1];
      if (q.startsWith("otag:mana-rock mv:1")) {
        return route.fulfill({
          json: {
            data: [
              named("Sol Ring"), // already in the deck: must be excluded
              card("Mana Vault", { mana_cost: "{1}", type_line: "Artifact", cmc: 1, color_identity: [] }),
              card("Sol Talisman", { mana_cost: "{1}", type_line: "Artifact", cmc: 1, color_identity: [] }),
              card("Mox Amber", { mana_cost: "{0}", type_line: "Legendary Artifact", cmc: 0, color_identity: [] }),
            ],
          },
        });
      }
      return route.fulfill({ json: { data: [] } });
    }
    return route.fulfill({ status: 404, json: {} });
  });
}

// Types a partial name and commits the given suggestion — the only way the
// form persists a card name.
async function pickName(page, ariaLabel, typed, fullName) {
  await page.fill(`input[aria-label="${ariaLabel}"]`, typed);
  await page.getByRole("option", { name: fullName }).click();
  await expect(page.getByLabel(ariaLabel, { exact: true })).toHaveValue(fullName);
}

test("deck brewer matrix customer journey", async ({ page }) => {
  if (!process.env.SCRYFALL_LIVE) await stubScryfall(page);

  // 1. Landing: one empty sub-deck, submit disabled until commander + a card
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Deck Brewer" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Look Up Cards" })).toBeDisabled();
  await expect(page.getByText(/commander required/)).toBeVisible();
  await page.screenshot({ path: `${SCREENSHOT_DIR}/01-landing.png` });

  // 2. Commander autocomplete: typing shows matching names
  await page.fill('input[aria-label="Commander"]', "atraxa");
  await expect(page.getByRole("option", { name: "Atraxa, Praetors' Voice" })).toBeVisible();
  await page.screenshot({ path: `${SCREENSHOT_DIR}/02-autocomplete.png` });
  await page.getByRole("option", { name: "Atraxa, Praetors' Voice" }).click();

  // Unselected free text must not persist: it reverts on blur
  await page.fill('input[aria-label="33 A card 1"]', "not a real card zzz");
  await page.locator('input[aria-label="Slot 1 note"]').focus();
  await expect(page.getByLabel("33 A card 1", { exact: true })).toHaveValue("");

  // 3. Fill four slots: note + tag are shared; the card belongs to 33 A
  const rows = [
    ["fast mana", "Mana Rock", "Sol Ring"],
    ["cheap answer", "Removal", "Swords to Plowshares"],
    ["stack interaction", "Counterspell", "Counterspell"],
    ["land ramp", "ramp", "Cultivate"], // lowercase tag on purpose
  ];
  for (let i = 0; i < rows.length; i++) {
    const [note, tag, name] = rows[i];
    await page.fill(`input[aria-label="Slot ${i + 1} note"]`, note);
    await page.fill(`input[aria-label="Slot ${i + 1} tag"]`, tag);
    await page.keyboard.press("Enter");
    await pickName(page, `33 A card ${i + 1}`, name.slice(0, 8).toLowerCase(), name);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${SCREENSHOT_DIR}/03-matrix-filled.png` });

  // 4. Submit: loading state, then composition summary
  await page.locator("button.submit").scrollIntoViewIfNeeded();
  await page.click("button.submit");
  await expect(page.getByRole("button", { name: "Looking up…" })).toBeVisible();
  await expect(page.getByText("Composition by tag")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Color identity:")).toBeVisible();
  await page.locator(".detail").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SCREENSHOT_DIR}/04-composition.png` });

  // 5. Per-cell suggestions: same tag & mana value, deck cards excluded
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.click('button[aria-label="Suggest alternatives for 33 A card 1"]');
  await expect(page.getByRole("link", { name: "Mana Vault" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sol Ring" })).toHaveCount(0);
  await expect(
    page.getByText(/Suggestions are always driven by 33 A/)
  ).toBeVisible();
  await page.screenshot({ path: `${SCREENSHOT_DIR}/05-suggestions.png` });

  // 6. Take a suggestion into a new sub-deck: 33 B appears, seeded with it
  await page
    .locator(".sugg", { hasText: "Mana Vault" })
    .getByRole("button", { name: "→ new 33" })
    .click();
  await expect(page.getByLabel("33 B card 1", { exact: true })).toHaveValue("Mana Vault");
  await page.screenshot({ path: `${SCREENSHOT_DIR}/06-take-new-33.png` });

  // A cross-sub-deck duplicate is flagged (Commander singleton)
  await pickName(page, "33 B card 2", "sol ring", "Sol Ring");
  await expect(page.getByText("duplicate in deck")).toHaveCount(2);

  // 7. Changing a shared tag warns about same-row cards in other sub-decks
  await page.fill('input[aria-label="Slot 1 tag"]', "Ramp");
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("“Mana Rock” → “Ramp”");
  await expect(dialog).toContainText("Sol Ring (33 A)");
  await expect(dialog).toContainText("Mana Vault (33 B)");
  await page.screenshot({ path: `${SCREENSHOT_DIR}/07-tag-warning.png` });

  // 8. Confirming flags the affected cells amber (persistent, dismissable)
  await dialog.getByRole("button", { name: "Change & flag" }).click();
  await expect(page.getByText(/picked when slot 1 tag was “Mana Rock”/)).toHaveCount(2);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${SCREENSHOT_DIR}/08-flags-and-dup.png` });

  // State survives a reload (localStorage)
  await page.reload();
  await expect(page.getByLabel("33 B card 1", { exact: true })).toHaveValue("Mana Vault");
  await expect(page.getByText(/picked when slot 1 tag was “Mana Rock”/)).toHaveCount(2);

  // 9. Land Calculator tab still works
  await page.click('button:has-text("Land Calculator")');
  await expect(page.getByText("MTG Land Draw Calculator")).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${SCREENSHOT_DIR}/09-land-calculator.png` });
});
