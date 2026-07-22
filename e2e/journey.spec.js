import { test, expect } from "@playwright/test";
import { card, catalogMatches } from "../test/fixtures.js";

// Walks the full customer journey through the Deck Brewer: the commander
// picker entry screen, then the matrix + consistency-rail workspace. Captures
// the screenshots embedded in pull request descriptions (docs/screenshots/).
//
// Scryfall responses are stubbed at the network layer so the run is
// deterministic and works offline. Set SCRYFALL_LIVE=1 to skip the stubs
// and exercise the real API (subject to rate limits and data drift).

const SCREENSHOT_DIR = "docs/screenshots";

const CARD_DATA = {
  "Sol Ring": { mana_cost: "{1}", type_line: "Artifact", cmc: 1, color_identity: [] },
  "Mana Vault": { mana_cost: "{1}", type_line: "Artifact", cmc: 1, color_identity: [] },
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
              card("Fellwar Stone", { mana_cost: "{2}", type_line: "Artifact", cmc: 2, color_identity: [] }),
              card("Mind Stone", { mana_cost: "{2}", type_line: "Artifact", cmc: 2, color_identity: [] }),
            ],
          },
        });
      }
      return route.fulfill({ json: { data: [] } });
    }
    return route.fulfill({ status: 404, json: {} });
  });
}

// Types a partial name and commits the given suggestion — the only way a
// card name persists.
async function pickName(page, ariaLabel, typed, fullName) {
  await page.fill(`input[aria-label="${ariaLabel}"]`, typed);
  // Scope to the open listbox so tag-select <option>s aren't matched.
  await page.getByRole("listbox").getByRole("option", { name: fullName }).click();
  await expect(page.getByLabel(ariaLabel, { exact: true })).toHaveValue(fullName);
}

test("deck brewer matrix customer journey", async ({ page }) => {
  if (!process.env.SCRYFALL_LIVE) await stubScryfall(page);

  // 1. Commander picker: Look Up is gated until a commander is chosen
  await page.goto("/");
  await expect(page.locator(".brand-name")).toHaveText("Deck Brewer");
  await expect(page.getByText(/Pick a commander/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Look Up Cards/ })).toBeDisabled();
  await page.screenshot({ path: `${SCREENSHOT_DIR}/01-commander.png` });

  // 2. Commander autocomplete
  await page.fill('input[aria-label="Commander"]', "atraxa");
  await expect(page.getByRole("option", { name: "Atraxa, Praetors' Voice" })).toBeVisible();
  await page.screenshot({ path: `${SCREENSHOT_DIR}/02-autocomplete.png` });
  await page.getByRole("option", { name: "Atraxa, Praetors' Voice" }).click();
  await page.getByRole("button", { name: /Look Up Cards/ }).click();

  // Workspace opens; unselected free text must not persist (reverts on blur)
  await expect(page.getByText("Composition matrix")).toBeVisible();
  await page.fill('input[aria-label="33 A card 1"]', "not a real card zzz");
  await page.locator('textarea[aria-label="Slot 1 note"]').focus();
  await expect(page.getByLabel("33 A card 1", { exact: true })).toHaveValue("");

  // 3. Fill four slots: note + tag are shared; the card belongs to 33 A.
  // The tag is a restricted dropdown (known categories or Custom).
  const rows = [
    ["fast mana", "Mana Rock", "Sol Ring"],
    ["cheap answer", "Removal", "Swords to Plowshares"],
    ["stack interaction", "Counterspell", "Counterspell"],
    ["land ramp", "Ramp", "Cultivate"],
  ];
  for (let i = 0; i < rows.length; i++) {
    const [note, tag, name] = rows[i];
    await page.fill(`textarea[aria-label="Slot ${i + 1} note"]`, note);
    await page.selectOption(`select[aria-label="Slot ${i + 1} tag"]`, tag);
    await pickName(page, `33 A card ${i + 1}`, name.slice(0, 8).toLowerCase(), name);
  }
  // Color-identity pips + fill bars confirm the commander and cards resolved.
  await expect(page.locator(".ci-pip").first()).toBeVisible();
  await expect(page.locator(".fill-count").first()).toHaveText("4 / 33");
  // Select the Mana Rock row so the workspace shot shows a populated strip.
  await page.getByLabel("33 A card 1", { exact: true }).click();
  await expect(page.getByRole("link", { name: "Mana Vault" })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${SCREENSHOT_DIR}/03-workspace.png` });

  // 4. Suggestions: three sub-decks are always shown; select an empty 33 B cell
  await page.getByLabel("33 B card 1", { exact: true }).click();
  await expect(page.getByRole("link", { name: "Mana Vault" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sol Ring" })).toHaveCount(0);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/04-suggestions.png` });

  // Take Mana Vault into the active column (33 B)
  await page
    .locator(".strip-card", { hasText: "Mana Vault" })
    .getByRole("button", { name: "→ 33 B" })
    .click();
  await expect(page.getByLabel("33 B card 1", { exact: true })).toHaveValue("Mana Vault");

  // A cross-sub-deck duplicate is flagged (Commander singleton)
  await pickName(page, "33 B card 2", "sol ring", "Sol Ring");
  await expect(page.getByText("duplicate in deck")).toHaveCount(2);

  // 5. Consistency check: 33 B card 2 (Sol Ring, an artifact) diverges from
  // 33 A card 2 (Swords to Plowshares, an instant) in card type.
  await expect(page.getByText(/differs from 33 A: card type/)).toBeVisible();
  await expect(page.getByText(/1 card differs from 33 A/)).toBeVisible(); // rail tally
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${SCREENSHOT_DIR}/06-consistency.png` });

  // 6b. Deck stats section: mana curve + per-colour symbol/production breakdown.
  const stats = page.getByRole("region", { name: "Deck stats" });
  await expect(stats.getByText("Deck Stats")).toBeVisible();
  await expect(stats.getByText(/Mana curve/)).toBeVisible();
  await expect(stats.getByText("White")).toBeVisible();
  await stats.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SCREENSHOT_DIR}/10-deck-stats.png` });

  // 6c. Plan layer: a deck-level game plan + a role target that reads as a
  // checklist. Mana Rock has 1 slot; a target of 2 leaves it "short 1".
  await page
    .locator("#game-plan-input")
    .fill("Ramp into Atraxa, then grind proliferate value.");
  await page.getByLabel("Mana Rock target").fill("2");
  await expect(page.getByText("short 1")).toBeVisible();
  await expect(page.getByText(/role is short of its target/)).toBeVisible();
  const compositionPanel = page
    .locator(".detail")
    .filter({ hasText: "Composition & role targets" });
  await compositionPanel.scrollIntoViewIfNeeded();
  await compositionPanel.screenshot({ path: `${SCREENSHOT_DIR}/11-role-targets.png` });

  // 7. Export — either a flat Moxfield list or the re-importable sub-deck format
  await page.getByRole("button", { name: "Export" }).click();
  const exportDialog = page.getByRole("dialog", { name: "Export deck" });
  await expect(exportDialog.getByLabel("Moxfield decklist")).toHaveValue(
    /Commander\n1 Atraxa/
  );
  await expect(exportDialog.getByLabel("Moxfield decklist")).toHaveValue(/Mana Vault/);
  // Switch to the Brewer sub-deck format (lays sub-decks side by side).
  await exportDialog.getByRole("radio", { name: "Brewer sub-decks" }).click();
  const brewText = await exportDialog.getByLabel("Brewer sub-deck list").inputValue();
  expect(brewText).toContain("Commander: Atraxa");
  expect(brewText).toContain("33 A\t33 B\t33 C");
  // The plan + role targets ride along in the sub-deck export.
  expect(brewText).toContain("Plan: Ramp into Atraxa");
  expect(brewText).toContain("Mana Rock=2");
  await page.screenshot({ path: `${SCREENSHOT_DIR}/07-export.png` });
  await exportDialog.getByRole("button", { name: "Close" }).click();

  // Re-import that sub-deck export → the brew comes back after a Clear.
  page.once("dialog", (d) => d.accept()); // confirm the Clear prompt
  await page.getByRole("button", { name: "Clear" }).click();
  await page.getByRole("button", { name: /or import a saved brew/ }).click();
  const importDialog = page.getByRole("dialog", { name: "Import brew" });
  await importDialog.getByLabel("Brew to import").fill(brewText);
  await importDialog.getByRole("button", { name: "Import" }).click();
  await expect(page.getByLabel("33 B card 1", { exact: true })).toHaveValue("Mana Vault");
  // The plan and role target came back with the brew.
  await expect(page.locator("#game-plan-input")).toHaveValue(/Ramp into Atraxa/);
  await expect(page.getByLabel("Mana Rock target")).toHaveValue("2");

  // State survives a reload (localStorage reopens straight into the workspace)
  await page.reload();
  await expect(page.getByLabel("33 B card 1", { exact: true })).toHaveValue("Mana Vault");
  await expect(page.getByText("duplicate in deck")).toHaveCount(2);

  // 8. Hypergeometric Calculator tab still works
  await page.click('button:has-text("Hypergeometric Calculator")');
  await expect(
    page.getByRole("heading", { name: "Hypergeometric Calculator" })
  ).toBeVisible();
  // Mirror the reference scenario: 9 copies in a 100-card deck, drawing 9.
  await page.getByLabel(/Copies in Deck/).fill("9");
  await page.getByLabel(/Cards Drawn/).fill("9");
  await expect(page.locator(".headline-value")).toHaveText("58.8%");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${SCREENSHOT_DIR}/08-hypergeometric.png`, fullPage: true });

  // 9. Strategy tab: the in-app deck-building philosophy that guides the tool.
  await page.click('button:has-text("Strategy")');
  await expect(
    page.getByRole("heading", { name: /33-Card Deck-Building Strategy/ })
  ).toBeVisible();
  await expect(page.getByText("3 × 33 cards")).toBeVisible();
  await expect(page.getByText("The seven tenets")).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${SCREENSHOT_DIR}/09-strategy.png`, fullPage: true });

  // A "jump to" button hands the reader off to the matching tab.
  await page.getByRole("button", { name: "Open the Deck Brewer" }).click();
  await expect(page.getByText("Composition matrix")).toBeVisible();
});

// The Add Token menu should list the tokens the deck's cards can make —
// including the commander's — each with art, instead of the generic presets.
test("deck brewer playtest lists the commander's tokens with art", async ({ page }) => {
  test.skip(!!process.env.SCRYFALL_LIVE, "uses fabricated all_parts");
  const tokenId = "tok-angel";
  await page.route("https://api.scryfall.com/**", async (route) => {
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
          // Atraxa doesn't really make tokens; fabricated to exercise the flow.
          all_parts: [{ id: tokenId, component: "token", name: "Angel" }],
        }),
      });
    }
    if (url.includes("/cards/collection")) {
      const { identifiers } = route.request().postDataJSON();
      if (identifiers[0]?.id) {
        // Token art fetched by Scryfall id (a tiny inline PNG so it loads offline).
        return route.fulfill({
          json: {
            data: identifiers.map(({ id }) => ({
              ...card("Angel", { type_line: "Token Creature — Angel" }),
              id,
              power: "4",
              toughness: "4",
              image_uris: {
                normal:
                  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
              },
            })),
            not_found: [],
          },
        });
      }
      return route.fulfill({
        json: { data: identifiers.map(({ name }) => card(name, { cmc: 1 })), not_found: [] },
      });
    }
    return route.fulfill({ status: 404, json: {} });
  });

  await page.goto("/");
  await page.fill('input[aria-label="Commander"]', "atraxa");
  await page.getByRole("option", { name: "Atraxa, Praetors' Voice" }).click();
  await page.getByRole("button", { name: /Look Up Cards/ }).click();
  await expect(page.getByText("Composition matrix")).toBeVisible();

  // One card so the Playtest has a deck to shuffle.
  await pickName(page, "33 A card 1", "sol ring", "Sol Ring");

  // Playtest → Add Token: the commander's Angel token shows as name + stats
  // (4/4), and the generic presets (Treasure, …) are gone.
  await page.getByRole("button", { name: /Playtest/ }).click();
  await page.getByRole("button", { name: "Start Playtest" }).click();
  const overlay = page.getByRole("dialog", { name: "Playtest" });
  await overlay.getByRole("button", { name: /Add.*Token/ }).click();
  const tokenMenu = page.getByRole("dialog", { name: "Add token" });
  await expect(tokenMenu.getByRole("button", { name: /Angel/ })).toBeVisible();
  await expect(tokenMenu.getByRole("button", { name: "Treasure" })).toHaveCount(0);
  await expect(tokenMenu.getByText("(4/4)")).toBeVisible(); // name + P/T stats
  await page.screenshot({ path: `${SCREENSHOT_DIR}/12-deck-brewer-tokens.png` });

  // Creating a token leaves the menu open (add several in a row).
  await tokenMenu.getByRole("button", { name: /Angel/ }).click();
  await expect(tokenMenu).toBeVisible();
  await expect(overlay.getByRole("button", { name: "Angel", exact: true })).toBeVisible();
});
