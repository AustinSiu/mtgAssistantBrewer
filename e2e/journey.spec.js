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
  await expect(page.getByText(/Pick your commander/)).toBeVisible();
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

  // 5. Changing a shared tag warns about same-row cards in other sub-decks
  await page.selectOption('select[aria-label="Slot 1 tag"]', "Ramp");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("“Mana Rock” → “Ramp”");
  await expect(dialog).toContainText("Sol Ring (33 A)");
  await expect(dialog).toContainText("Mana Vault (33 B)");
  await page.screenshot({ path: `${SCREENSHOT_DIR}/05-tag-warning.png` });

  // 6. Confirming flags the affected cells; the rail tallies what needs attention
  await dialog.getByRole("button", { name: "Change & flag" }).click();
  await expect(page.getByText(/picked when slot 1 tag was “Mana Rock”/)).toHaveCount(2);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${SCREENSHOT_DIR}/06-flags-and-dup.png` });

  // 7. Export to a Moxfield-importable decklist (whole deck or sub-decks)
  await page.getByRole("button", { name: "Export" }).click();
  const exportDialog = page.getByRole("dialog", { name: "Export to Moxfield" });
  await expect(exportDialog.getByLabel("Moxfield decklist")).toHaveValue(
    /Commander\n1 Atraxa/
  );
  await expect(exportDialog.getByLabel("Moxfield decklist")).toHaveValue(/Mana Vault/);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/07-export.png` });
  await exportDialog.getByRole("button", { name: "Close" }).click();

  // State survives a reload (localStorage reopens straight into the workspace)
  await page.reload();
  await expect(page.getByLabel("33 B card 1", { exact: true })).toHaveValue("Mana Vault");
  await expect(page.getByText(/picked when slot 1 tag was “Mana Rock”/)).toHaveCount(2);

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
});
