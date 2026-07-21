import { test, expect } from "@playwright/test";
import { card, catalogMatches } from "../test/fixtures.js";

// Drives the Deck List tab end to end and captures its PR screenshots.
// Scryfall (and its mana-symbol SVGs) are stubbed so the run is offline and
// deterministic; SCRYFALL_LIVE=1 exercises the real API.

const SCREENSHOT_DIR = "docs/screenshots";

// Card data keyed by lowercased name — type line, mana cost, price.
const DB = {
  "atraxa, praetors' voice": card("Atraxa, Praetors' Voice", { type_line: "Legendary Creature — Phyrexian Angel Horror", mana_cost: "{G}{W}{U}{B}", cmc: 4, color_identity: ["W", "U", "B", "G"], prices: { usd: "5.20" } }),
  "sol ring": card("Sol Ring", { type_line: "Artifact", mana_cost: "{1}", cmc: 1, color_identity: [], prices: { usd: "1.50" } }),
  cultivate: card("Cultivate", { type_line: "Sorcery", mana_cost: "{2}{G}", cmc: 3, color_identity: ["G"], prices: { usd: "0.50" } }),
  counterspell: card("Counterspell", { type_line: "Instant", mana_cost: "{U}{U}", cmc: 2, color_identity: ["U"], prices: { usd: "1.00" } }),
  "llanowar elves": card("Llanowar Elves", { type_line: "Creature — Elf Druid", mana_cost: "{G}", cmc: 1, color_identity: ["G"], prices: { usd: "0.25" } }),
  "wrath of god": card("Wrath of God", { type_line: "Sorcery", mana_cost: "{2}{W}{W}", cmc: 4, color_identity: ["W"], prices: { usd: "8.00" } }),
  "rhystic study": card("Rhystic Study", { type_line: "Enchantment", mana_cost: "{2}{U}", cmc: 3, color_identity: ["U"], prices: { usd: "22.00" } }),
  forest: card("Forest", { type_line: "Basic Land — Forest", mana_cost: "", cmc: 0, color_identity: ["G"], prices: { usd: "0.10" } }),
};

// 1×1 PNG standing in for the mana-symbol SVGs (svgs.scryfall.io).
const PIP_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

async function stubScryfall(page) {
  await page.route("https://svgs.scryfall.io/**", (r) =>
    r.fulfill({ contentType: "image/png", body: PIP_PNG })
  );
  await page.route("https://api.scryfall.com/**", (route) => {
    const url = decodeURIComponent(route.request().url());
    if (url.includes("/cards/autocomplete")) {
      return route.fulfill({ json: { data: catalogMatches(url.split("q=")[1]) } });
    }
    if (url.includes("/cards/collection")) {
      const { identifiers } = route.request().postDataJSON();
      const data = [];
      const not_found = [];
      for (const { name } of identifiers) {
        const c = DB[name.toLowerCase()];
        if (c) data.push(c);
        else not_found.push({ name });
      }
      return route.fulfill({ json: { data, not_found } });
    }
    return route.fulfill({ status: 404, json: {} });
  });
}

// Real pointer drag from the center of `source` to a point in `target`
// (its center, shifted by dx/dy). Intermediate moves clear the drag threshold.
async function dragOnto(page, source, target, { dx = 0, dy = 0 } = {}) {
  const s = await source.boundingBox();
  const t = await target.boundingBox();
  const sx = s.x + s.width / 2;
  const sy = s.y + s.height / 2;
  const tx = t.x + t.width / 2 + dx;
  const ty = t.y + t.height / 2 + dy;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move((sx + tx) / 2, (sy + ty) / 2, { steps: 5 });
  await page.mouse.move(tx, ty, { steps: 5 });
  await page.mouse.up();
}

test("deck list tab customer journey", async ({ page }) => {
  if (!process.env.SCRYFALL_LIVE) await stubScryfall(page);

  await page.goto("/");
  await page.getByRole("button", { name: "Deck List" }).click();
  await expect(page.getByText(/No cards yet/)).toBeVisible();
  await page.screenshot({ path: `${SCREENSHOT_DIR}/decklist-1-empty.png` });

  // Paste-import a Moxfield export: section headers auto-detect the commander,
  // the Sideboard is ignored, and one card can't be resolved by Scryfall.
  await page.getByRole("button", { name: /paste a decklist/ }).click();
  await page.getByLabel("Paste decklist").fill(
    [
      "Commander (1)",
      "1 Atraxa, Praetors' Voice (NCC) 5",
      "",
      "Creatures (2)",
      "1 Llanowar Elves",
      "1 Not A Real Card",
      "",
      "Other (5)",
      "1 Sol Ring (C21) 263",
      "1 Cultivate",
      "1 Counterspell",
      "1 Wrath of God",
      "1 Rhystic Study",
      "8 Forest",
      "",
      "Sideboard (1)",
      "1 Demonic Tutor",
    ].join("\n")
  );
  await page.getByRole("button", { name: "Import" }).click();
  await expect(page.getByRole("link", { name: "Rhystic Study" })).toBeVisible({ timeout: 30_000 });

  // The commander was detected from the header and leads its own group; the
  // Sideboard card was dropped.
  await expect(page.getByRole("heading", { name: /Commander/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Demonic Tutor" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /Lands/ })).toBeVisible();
  await expect(page.getByText(/16 \/ 100 cards/)).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${SCREENSHOT_DIR}/decklist-2-by-type.png`, fullPage: true });

  // Add a duplicate via search → singleton flag; tag two cards; group by tag.
  await page.getByLabel("Add a card").fill("counter");
  await page.getByRole("option", { name: "Counterspell" }).click();
  await expect(page.getByText("dup")).toBeVisible();

  await page.getByLabel("Tag for Sol Ring").fill("Mana Rock");
  await page.getByLabel("Tag for Cultivate").fill("Ramp");
  await page.getByRole("button", { name: "By tag" }).click();
  await expect(page.getByRole("heading", { name: /Mana Rock/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Ramp/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Unresolved/ })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${SCREENSHOT_DIR}/decklist-3-by-tag.png`, fullPage: true });

  // State survives a reload (localStorage).
  await page.reload();
  await page.getByRole("button", { name: "Deck List" }).click();
  await expect(page.getByRole("link", { name: "Rhystic Study" })).toBeVisible();

  // Playtest: shuffle up the deck, play a card from hand, advance the turn.
  await page.getByRole("button", { name: "▶ Playtest" }).click();
  const playtest = page.getByRole("dialog", { name: "Playtest" });
  await expect(playtest.getByText("Hand (7)")).toBeVisible();
  await expect(playtest.getByText("Turn 1")).toBeVisible();
  await expect(
    playtest.getByRole("button", { name: "Atraxa, Praetors' Voice" })
  ).toBeVisible(); // commander in the command zone

  // Hovering a card shows a larger preview docked to the right.
  const handCards = playtest.locator(".pt-hand-cards .pt-card-wrap");
  await handCards.first().hover();
  await expect(playtest.locator(".pt-preview")).toBeVisible();
  await page.screenshot({ path: `${SCREENSHOT_DIR}/decklist-6-hover-preview.png` });

  // Reorder the hand: drag the third card to the front.
  const thirdName = await handCards.nth(2).locator(".pt-proxy-name").innerText();
  await dragOnto(page, handCards.nth(2).locator(".pt-card"), handCards.first(), {
    dx: -30,
  });
  await expect(handCards.first().locator(".pt-proxy-name")).toHaveText(thirdName);

  // Drag the first hand card out onto the battlefield; it takes a board
  // position (inline --x/--y) and the hand shrinks.
  const field = playtest.locator(".pt-battlefield-cards");
  await dragOnto(page, playtest.locator(".pt-hand-cards .pt-card").first(), field, {
    dx: -120,
    dy: -10,
  });
  await expect(playtest.getByText("Hand (6)")).toBeVisible();
  const boardCard = playtest.locator(".pt-battlefield-cards .pt-card-wrap").first();
  await expect(boardCard).toHaveAttribute("style", /--x:/);

  // Slide it across the field — its stored position changes.
  const posBefore = await boardCard.getAttribute("style");
  await dragOnto(page, boardCard.locator(".pt-card"), field, { dx: 140, dy: 60 });
  await expect(boardCard).not.toHaveAttribute("style", posBefore);

  // A plain click still taps it; Next Turn untaps and draws.
  await boardCard.locator(".pt-card").click();
  await expect(playtest.locator(".pt-battlefield-cards .pt-card-tap.tapped")).toBeVisible();

  // The card's action menu stays upright even while the card is rotated/tapped.
  await playtest.getByRole("button", { name: /^Actions for/ }).click();
  await expect(playtest.getByRole("menuitem", { name: "Untap" })).toBeVisible();
  await page.screenshot({ path: `${SCREENSHOT_DIR}/decklist-5-tap-menu.png` });
  await page.keyboard.press("Escape"); // close the menu

  await playtest.getByRole("button", { name: "Next Turn" }).click();
  await expect(playtest.getByText("Turn 2")).toBeVisible();
  await expect(playtest.getByText("Hand (7)")).toBeVisible();

  // Drag the board card onto the graveyard pile to discard it.
  await dragOnto(page, boardCard.locator(".pt-card"), playtest.locator('[data-drop="graveyard"]'));
  await expect(playtest.getByText("Graveyard (1)")).toBeVisible();
  await expect(playtest.getByText("Hand (7)")).toBeVisible();

  // Keyboard shortcut: D draws a card.
  await page.keyboard.press("d");
  await expect(playtest.getByText("Hand (8)")).toBeVisible();

  // Add a Treasure token; it lands on the battlefield with a token frame.
  await playtest.getByRole("button", { name: /Add Token/ }).click();
  await playtest.getByRole("button", { name: "Treasure" }).click();
  await expect(
    playtest.locator(".pt-battlefield-cards .pt-card.token")
  ).toBeVisible();

  // Drag a fresh hand card onto the field so the board isn't bare.
  await dragOnto(page, playtest.locator(".pt-hand-cards .pt-card").first(), field, {
    dx: 40,
    dy: -20,
  });
  await expect(playtest.getByText("Hand (7)")).toBeVisible();

  // Open the library side panel; card names are legible and rows are draggable.
  await playtest.getByRole("button", { name: "View Library", exact: true }).click();
  const viewer = page.getByRole("dialog", { name: "Library" });
  await expect(viewer.getByText(/Viewing Library/)).toBeVisible();
  const libCount = await viewer.locator(".pt-library-row").count();
  await page.screenshot({ path: `${SCREENSHOT_DIR}/decklist-7-library-panel.png` });

  // Drag the top library card (by its name) onto the battlefield.
  await dragOnto(
    page,
    viewer.locator(".pt-library-row").first().locator(".pt-library-name"),
    field,
    { dx: 40, dy: 40 }
  );
  await expect(viewer.locator(".pt-library-row")).toHaveCount(libCount - 1);

  await viewer.getByRole("button", { name: "Close", exact: true }).click();

  await page.screenshot({ path: `${SCREENSHOT_DIR}/decklist-4-playtest.png` });

  await playtest.getByRole("button", { name: "Close playtest" }).click();
  await playtest.getByRole("button", { name: "Leave" }).click(); // confirm close
  await expect(page.getByRole("dialog", { name: "Playtest" })).toHaveCount(0);
});
