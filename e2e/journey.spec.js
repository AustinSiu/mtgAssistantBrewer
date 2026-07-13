import { test, expect } from "@playwright/test";

// Walks the full customer journey through the Deck Brewer and captures the
// screenshots embedded in pull request descriptions (docs/screenshots/).
//
// Scryfall responses are stubbed at the network layer so the run is
// deterministic and works offline. Set SCRYFALL_LIVE=1 to skip the stubs
// and exercise the real API (subject to rate limits and data drift).

import { card, catalogMatches } from "../test/fixtures.js";

const SCREENSHOT_DIR = "docs/screenshots";

const instant = (name, mana_cost, cmc, color_identity) =>
  card(name, { mana_cost, type_line: "Instant", cmc, color_identity });
const sorcery = (name, mana_cost, cmc, color_identity) =>
  card(name, { mana_cost, type_line: "Sorcery", cmc, color_identity });

const SUGGESTIONS = {
  "otag:mana-rock mv:1": [
    card("Mana Vault", { mana_cost: "{1}", type_line: "Artifact", cmc: 1, color_identity: [] }),
    card("Sol Talisman", { mana_cost: "{1}", type_line: "Artifact", cmc: 1, color_identity: [] }),
  ],
  "otag:targeted-removal mv:1": [
    instant("Path to Exile", "{W}", 1, ["W"]),
    instant("Condemn", "{W}", 1, ["W"]),
    instant("Fatal Push", "{B}", 1, ["B"]),
  ],
  "otag:counterspell mv:2": [
    instant("Negate", "{1}{U}", 2, ["U"]),
    instant("Arcane Denial", "{1}{U}", 2, ["U"]),
    instant("Remand", "{1}{U}", 2, ["U"]),
  ],
  "otag:ramp mv:3": [
    sorcery("Kodama's Reach", "{2}{G}", 3, ["G"]),
    instant("Harrow", "{2}{G}", 3, ["G"]),
    sorcery("Grow from the Ashes", "{2}{G}", 3, ["G"]),
  ],
  "otag:card-draw mv:3": [
    card("Phyrexian Arena", { mana_cost: "{1}{B}{B}", type_line: "Enchantment", cmc: 3, color_identity: ["B"] }),
    card("Verity Circle", { mana_cost: "{2}{U}", type_line: "Enchantment", cmc: 3, color_identity: ["U"] }),
  ],
  "otag:board-wipe mv:4": [
    sorcery("Day of Judgment", "{2}{W}{W}", 4, ["W"]),
    sorcery("Damnation", "{2}{B}{B}", 4, ["B"]),
    sorcery("Languish", "{2}{B}{B}", 4, ["B"]),
  ],
  "otag:targeted-removal mv:3": [
    instant("Generous Gift", "{2}{W}", 3, ["W"]),
    instant("Anguished Unmaking", "{1}{W}{B}", 3, ["W", "B"]),
  ],
};

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
      await new Promise((r) => setTimeout(r, 1000)); // keep the loading state visible
      return route.fulfill({
        json: {
          data: [
            card("Sol Ring", { mana_cost: "{1}", type_line: "Artifact", cmc: 1, color_identity: [] }),
            instant("Swords to Plowshares", "{W}", 1, ["W"]),
            instant("Counterspell", "{U}{U}", 2, ["U"]),
            sorcery("Cultivate", "{2}{G}", 3, ["G"]),
            card("Rhystic Study", { mana_cost: "{2}{U}", type_line: "Enchantment", cmc: 3, color_identity: ["U"] }),
            sorcery("Wrath of God", "{2}{W}{W}", 4, ["W"]),
            instant("Beast Within", "{2}{G}", 3, ["G"]),
          ],
          not_found: [],
        },
      });
    }
    if (url.includes("/cards/search")) {
      const q = url.split("?q=")[1].split("&")[0];
      const key = Object.keys(SUGGESTIONS).find((k) => q.startsWith(k));
      return route.fulfill({ json: { data: key ? SUGGESTIONS[key] : [] } });
    }
    return route.fulfill({ status: 404, json: {} });
  });
}

// Types a partial name and commits the given suggestion — the only way the
// form persists a card name.
async function pickName(page, ariaLabel, typed, fullName) {
  await page.fill(`input[aria-label="${ariaLabel}"]`, typed);
  await page.getByRole("option", { name: fullName }).click();
  await expect(page.getByLabel(ariaLabel)).toHaveValue(fullName);
}

test("deck brewer customer journey", async ({ page }) => {
  if (!process.env.SCRYFALL_LIVE) await stubScryfall(page);

  // 1. Landing page: submit disabled, commander required
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Deck Brewer" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Look Up Cards" })).toBeDisabled();
  await expect(page.getByText(/commander required/)).toBeVisible();
  await page.screenshot({ path: `${SCREENSHOT_DIR}/01-landing.png` });

  // 2. Autocomplete: typing shows matching names
  await page.fill('input[aria-label="Commander"]', "atraxa");
  await expect(
    page.getByRole("option", { name: "Atraxa, Praetors' Voice" })
  ).toBeVisible();
  await page.screenshot({ path: `${SCREENSHOT_DIR}/02-autocomplete.png` });
  await page.getByRole("option", { name: "Atraxa, Praetors' Voice" }).click();
  await expect(page.getByLabel("Commander")).toHaveValue("Atraxa, Praetors' Voice");

  // Unselected free text must not persist: it reverts on blur
  await page.fill('input[aria-label="Card 1 name"]', "not a real card zzz");
  await page.locator('input[aria-label="Card 1 category"]').focus();
  await expect(page.getByLabel("Card 1 name")).toHaveValue("");

  // 3. Fill cards by picking suggestions
  const entries = [
    ["Sol Ring", "Mana Rock"],
    ["Swords to Plowshares", "Removal"],
    ["Counterspell", "Counterspell"],
    ["Cultivate", "ramp"], // lowercase on purpose: matching is case-insensitive
    ["Rhystic Study", "Card Draw"],
    ["Wrath of God", "Board Wipe"],
    ["Beast Within", "Removal"],
  ];
  for (let i = 0; i < entries.length; i++) {
    await pickName(
      page,
      `Card ${i + 1} name`,
      entries[i][0].slice(0, 8).toLowerCase(),
      entries[i][0]
    );
    await page.fill(`input[aria-label="Card ${i + 1} category"]`, entries[i][1]);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${SCREENSHOT_DIR}/03-form-filled.png` });

  // 4. Submit and capture the loading state
  await page.locator("button.submit").scrollIntoViewIfNeeded();
  await page.click("button.submit");
  await expect(page.getByRole("button", { name: "Looking up…" })).toBeVisible();
  await page.screenshot({ path: `${SCREENSHOT_DIR}/04-submitting.png` });

  // 5. Results: commander identity confirmed, category breakdown
  await expect(page.getByText("Scryfall Results")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Color identity:")).toBeVisible();
  await page.locator(".form-section").screenshot({
    path: `${SCREENSHOT_DIR}/05-commander-identity.png`,
  });
  await page.locator(".detail").screenshot({
    path: `${SCREENSHOT_DIR}/06-category-breakdown.png`,
  });

  // 6. Results table with per-card suggestions
  await expect(page.getByText("7 of 7 cards found")).toBeVisible();
  if (!process.env.SCRYFALL_LIVE) {
    await expect(page.getByRole("link", { name: "Mana Vault" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Kodama's Reach" })).toBeVisible();
  }
  await page.locator("table.results-table").screenshot({
    path: `${SCREENSHOT_DIR}/07-results-suggestions.png`,
  });

  // 7. Land Calculator tab still works, and brewer state survives the switch
  await page.click('button:has-text("Land Calculator")');
  await expect(page.getByText("MTG Land Draw Calculator")).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${SCREENSHOT_DIR}/08-land-calculator.png` });
  await page.click('button:has-text("Deck Brewer")');
  await expect(page.getByLabel("Card 1 name")).toHaveValue("Sol Ring");
});
