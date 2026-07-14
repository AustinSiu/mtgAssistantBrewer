import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import DeckList from "./DeckList";
import { clearAutocompleteCache } from "./scryfall";
import { card as mockCard, catalogMatches } from "../test/fixtures";

const ok = (data) => ({ ok: true, json: async () => data });

// A small card database keyed by lowercased name.
const DB = {
  "sol ring": mockCard("Sol Ring", { type_line: "Artifact", cmc: 1, color_identity: [], prices: { usd: "1.50" } }),
  cultivate: mockCard("Cultivate", { type_line: "Sorcery", cmc: 3, color_identity: ["G"], prices: { usd: "0.50" } }),
  counterspell: mockCard("Counterspell", { type_line: "Instant", cmc: 2, color_identity: ["U"], prices: { usd: "1.00" } }),
  "llanowar elves": mockCard("Llanowar Elves", { type_line: "Creature — Elf Druid", cmc: 1, color_identity: ["G"], prices: { usd: "0.25" } }),
  "atraxa, praetors' voice": mockCard("Atraxa, Praetors' Voice", { type_line: "Legendary Creature — Angel", cmc: 4, color_identity: ["W", "U", "B", "G"], prices: { usd: "5.00" } }),
};

function setupFetch() {
  fetch.mockImplementation(async (url, options = {}) => {
    const decoded = decodeURIComponent(String(url));
    if (decoded.includes("cards/autocomplete")) {
      return ok({ data: catalogMatches(decoded.split("q=")[1]) });
    }
    if (decoded.includes("cards/collection")) {
      const { identifiers } = JSON.parse(options.body);
      const data = [];
      const not_found = [];
      for (const { name } of identifiers) {
        const c = DB[name.toLowerCase()];
        if (c) data.push(c);
        else not_found.push({ name });
      }
      return ok({ data, not_found });
    }
    return { ok: false, status: 404, json: async () => ({}) };
  });
}

async function addViaSearch(typed, fullName) {
  fireEvent.change(screen.getByLabelText("Add a card"), { target: { value: typed } });
  fireEvent.mouseDown(await screen.findByRole("option", { name: fullName }));
}

describe("DeckList", () => {
  beforeEach(() => {
    localStorage.clear();
    clearAutocompleteCache();
    vi.stubGlobal("fetch", vi.fn());
    setupFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows an empty state initially", () => {
    render(<DeckList />);
    expect(screen.getByText(/No cards yet/)).toBeInTheDocument();
  });

  it("adds a card by search, looks it up, and shows it under its type group", async () => {
    render(<DeckList />);
    await addViaSearch("sol ring", "Sol Ring");

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Sol Ring" })).toBeInTheDocument();
    });
    expect(screen.getByRole("heading", { name: /Artifacts/ })).toBeInTheDocument();
    // Price shows on the row, the group subtotal, and the deck total.
    expect(screen.getAllByText("$1.50").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/1 \/ 100 cards/)).toBeInTheDocument();
  });

  it("imports a pasted decklist and groups the cards by type", async () => {
    render(<DeckList />);
    fireEvent.click(screen.getByRole("button", { name: /paste a decklist/ }));
    fireEvent.change(screen.getByLabelText("Paste decklist"), {
      target: { value: "1 Sol Ring\n1 Cultivate\n1 Counterspell" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Cultivate" })).toBeInTheDocument();
    });
    expect(screen.getByRole("heading", { name: /Artifacts/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Instants/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Sorceries/ })).toBeInTheDocument();
    expect(screen.getByText(/3 \/ 100 cards/)).toBeInTheDocument();
  });

  it("toggles between type and tag grouping", async () => {
    render(<DeckList />);
    await addViaSearch("cultivate", "Cultivate");
    await waitFor(() => screen.getByRole("link", { name: "Cultivate" }));

    // Give it a tag, then switch to tag grouping.
    fireEvent.change(screen.getByLabelText("Tag for Cultivate"), {
      target: { value: "Ramp" },
    });
    fireEvent.click(screen.getByRole("button", { name: "By tag" }));

    const heads = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(heads.some((h) => h.startsWith("Ramp"))).toBe(true);
  });

  it("marks a non-basic card appearing more than once as a duplicate", async () => {
    render(<DeckList />);
    await addViaSearch("sol ring", "Sol Ring");
    await waitFor(() => screen.getByRole("link", { name: "Sol Ring" }));
    // Adding the same card again increments qty to 2 → breaks singleton.
    await addViaSearch("sol ring", "Sol Ring");

    await waitFor(() => {
      expect(screen.getByText("dup")).toBeInTheDocument();
    });
    expect(screen.getByText(/2 \/ 100 cards/)).toBeInTheDocument();
  });

  it("promotes a card to the Commander group", async () => {
    render(<DeckList />);
    await addViaSearch("atraxa", "Atraxa, Praetors' Voice");
    await waitFor(() => screen.getByRole("link", { name: "Atraxa, Praetors' Voice" }));

    fireEvent.click(
      screen.getByRole("button", { name: "Set Atraxa, Praetors' Voice as commander" })
    );
    const commanderHead = screen.getByRole("heading", { name: /Commander/ });
    expect(commanderHead).toBeInTheDocument();
  });

  it("removes a card with the qty stepper at 1", async () => {
    render(<DeckList />);
    await addViaSearch("sol ring", "Sol Ring");
    await waitFor(() => screen.getByRole("link", { name: "Sol Ring" }));

    fireEvent.click(screen.getByRole("button", { name: "Decrease Sol Ring" }));
    expect(screen.getByText(/No cards yet/)).toBeInTheDocument();
  });

  it("flags cards Scryfall cannot resolve", async () => {
    render(<DeckList />);
    fireEvent.click(screen.getByRole("button", { name: /paste a decklist/ }));
    fireEvent.change(screen.getByLabelText("Paste decklist"), {
      target: { value: "1 Not A Real Card" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    await waitFor(() => {
      expect(screen.getByText("not found")).toBeInTheDocument();
    });
    expect(screen.getByRole("heading", { name: /Unresolved/ })).toBeInTheDocument();
  });

  it("persists the deck to localStorage and restores it on remount", async () => {
    const { unmount } = render(<DeckList />);
    await addViaSearch("sol ring", "Sol Ring");
    await waitFor(() => screen.getByRole("link", { name: "Sol Ring" }));
    unmount();

    render(<DeckList />);
    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Sol Ring" })).toBeInTheDocument();
    });
  });
});
