import { test, expect } from "@playwright/test";

// Walks the full customer journey through the Deck Brewer and captures the
// screenshots embedded in pull request descriptions (docs/screenshots/).
//
// Scryfall responses are stubbed at the network layer so the run is
// deterministic and works offline. Set SCRYFALL_LIVE=1 to skip the stubs
// and exercise the real API (subject to rate limits and data drift).

const SCREENSHOT_DIR = "docs/screenshots";

const card = (name, mana_cost, type_line, cmc, color_identity) => ({
  name,
  mana_cost,
  type_line,
  cmc,
  color_identity,
  id: `id-${name}`,
  scryfall_uri: `https://scryfall.com/card/x/${encodeURIComponent(name)}`,
});

const SUGGESTIONS = {
  "otag:mana-rock mv:1": [
    card("Mana Vault", "{1}", "Artifact", 1, []),
    card("Sol Talisman", "{1}", "Artifact", 1, []),
  ],
  "otag:targeted-removal mv:1": [
    card("Path to Exile", "{W}", "Instant", 1, ["W"]),
    card("Condemn", "{W}", "Instant", 1, ["W"]),
    card("Fatal Push", "{B}", "Instant", 1, ["B"]),
    card("Dispatch", "{W}", "Instant", 1, ["W"]),
  ],
  "otag:counterspell mv:2": [
    card("Negate", "{1}{U}", "Instant", 2, ["U"]),
    card("Arcane Denial", "{1}{U}", "Instant", 2, ["U"]),
    card("Remand", "{1}{U}", "Instant", 2, ["U"]),
  ],
  "otag:ramp mv:3": [
    card("Kodama's Reach", "{2}{G}", "Sorcery — Arcane", 3, ["G"]),
    card("Harrow", "{2}{G}", "Instant", 3, ["G"]),
    card("Grow from the Ashes", "{2}{G}", "Sorcery", 3, ["G"]),
  ],
  "otag:card-draw mv:3": [
    card("Phyrexian Arena", "{1}{B}{B}", "Enchantment", 3, ["B"]),
    card("Verity Circle", "{2}{U}", "Enchantment", 3, ["U"]),
  ],
  "otag:board-wipe mv:4": [
    card("Day of Judgment", "{2}{W}{W}", "Sorcery", 4, ["W"]),
    card("Damnation", "{2}{B}{B}", "Sorcery", 4, ["B"]),
    card("Languish", "{2}{B}{B}", "Sorcery", 4, ["B"]),
  ],
  "otag:targeted-removal mv:3": [
    card("Generous Gift", "{2}{W}", "Instant", 3, ["W"]),
    card("Anguished Unmaking", "{1}{W}{B}", "Instant", 3, ["W", "B"]),
  ],
};

async function stubScryfall(page) {
  await page.route("https://api.scryfall.com/**", async (route) => {
    // Match against the decoded URL: the app encodes "otag:ramp" as
    // "otag%3Aramp", which naive matching silently misses.
    const url = decodeURIComponent(route.request().url());
    if (url.includes("fuzzy=Atraxa")) {
      return route.fulfill({
        json: card(
          "Atraxa, Praetors' Voice",
          "{G}{W}{U}{B}",
          "Legendary Creature — Phyrexian Angel Horror",
          4,
          ["W", "U", "B", "G"]
        ),
      });
    }
    if (url.includes("fuzzy=Beast Wthin")) {
      return route.fulfill({ json: card("Beast Within", "{2}{G}", "Instant", 3, ["G"]) });
    }
    if (url.includes("fuzzy=Totally Fake Card")) {
      return route.fulfill({ status: 404, json: { object: "error", code: "not_found" } });
    }
    if (url.includes("/cards/collection")) {
      await new Promise((r) => setTimeout(r, 1000)); // keep the loading state visible
      return route.fulfill({
        json: {
          data: [
            card("Sol Ring", "{1}", "Artifact", 1, []),
            card("Swords to Plowshares", "{W}", "Instant", 1, ["W"]),
            card("Counterspell", "{U}{U}", "Instant", 2, ["U"]),
            card("Cultivate", "{2}{G}", "Sorcery", 3, ["G"]),
            card("Rhystic Study", "{2}{U}", "Enchantment", 3, ["U"]),
            card("Wrath of God", "{2}{W}{W}", "Sorcery", 4, ["W"]),
          ],
          not_found: [{ name: "Beast Wthin" }, { name: "Totally Fake Card" }],
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

test("deck brewer customer journey", async ({ page }) => {
  if (!process.env.SCRYFALL_LIVE) await stubScryfall(page);

  // 1. Landing page
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Deck Brewer" })).toBeVisible();
  await page.screenshot({ path: `${SCREENSHOT_DIR}/01-landing.png` });

  // 2. Fill commander and cards (typo + fake card exercise the fallbacks)
  await page.fill("#commander", "Atraxa");
  const entries = [
    ["Sol Ring", "Mana Rock"],
    ["Swords to Plowshares", "Removal"],
    ["Counterspell", "Counterspell"],
    ["Cultivate", "ramp"], // lowercase on purpose: matching is case-insensitive
    ["Rhystic Study", "Card Draw"],
    ["Wrath of God", "Board Wipe"],
    ["Beast Wthin", "Removal"], // typo resolved by fuzzy lookup
    ["Totally Fake Card", ""], // not found anywhere
  ];
  for (let i = 0; i < entries.length; i++) {
    await page.fill(`input[aria-label="Card ${i + 1} name"]`, entries[i][0]);
    if (entries[i][1]) {
      await page.fill(`input[aria-label="Card ${i + 1} category"]`, entries[i][1]);
    }
  }
  await page.screenshot({ path: `${SCREENSHOT_DIR}/02-form-filled.png` });

  // 3. Submit and capture the loading state
  await page.locator("button.submit").scrollIntoViewIfNeeded();
  await page.click("button.submit");
  await expect(page.getByRole("button", { name: "Looking up…" })).toBeVisible();
  await page.screenshot({ path: `${SCREENSHOT_DIR}/03-submitting.png` });

  // 4. Results: commander identity confirmed, category breakdown
  await expect(page.getByText("Scryfall Results")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Color identity:")).toBeVisible();
  await page.locator(".form-section").screenshot({
    path: `${SCREENSHOT_DIR}/04-commander-identity.png`,
  });
  await page.locator(".detail").screenshot({
    path: `${SCREENSHOT_DIR}/05-category-breakdown.png`,
  });

  // 5. Results table with per-card suggestions
  await expect(page.getByText("7 of 8 cards found")).toBeVisible();
  await expect(page.getByText("(entered: Beast Wthin)")).toBeVisible();
  await expect(page.getByText("not found")).toBeVisible();
  if (!process.env.SCRYFALL_LIVE) {
    await expect(page.getByRole("link", { name: "Mana Vault" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Kodama's Reach" })).toBeVisible();
  }
  await page.locator("table.results-table").screenshot({
    path: `${SCREENSHOT_DIR}/06-results-suggestions.png`,
  });

  // 6. Land Calculator tab still works, and brewer state survives the switch
  await page.click('button:has-text("Land Calculator")');
  await expect(page.getByText("MTG Land Draw Calculator")).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${SCREENSHOT_DIR}/07-land-calculator.png` });
  await page.click('button:has-text("Deck Brewer")');
  await expect(page.getByLabel("Card 1 name")).toHaveValue("Sol Ring");
});
