import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import Playtest from "./Playtest";
import { card } from "../test/fixtures";

const deckOf = (n) =>
  Array.from({ length: n }, (_, i) => ({
    name: `Card ${i + 1}`,
    card: card(`Card ${i + 1}`, { type_line: "Artifact", mana_cost: "{1}" }),
  }));

function renderPlaytest({ n = 10, onClose = vi.fn(), resolveDropTarget, resolveHandIndex } = {}) {
  render(
    <Playtest
      deck={deckOf(n)}
      commander={{ name: "Atraxa, Praetors' Voice", card: card("Atraxa, Praetors' Voice") }}
      onClose={onClose}
      {...(resolveDropTarget ? { resolveDropTarget } : {})}
      {...(resolveHandIndex ? { resolveHandIndex } : {})}
    />
  );
  return { onClose };
}

// Drive a pointer drag from `el` over the (stubbed) drop target: press, travel
// past the threshold, release.
function dragCard(el, { from = { x: 10, y: 10 }, to = { x: 120, y: 90 } } = {}) {
  fireEvent.pointerDown(el, { button: 0, pointerId: 1, clientX: from.x, clientY: from.y });
  fireEvent.pointerMove(window, { clientX: to.x, clientY: to.y });
  fireEvent.pointerUp(window, { clientX: to.x, clientY: to.y });
}

describe("Playtest", () => {
  it("opens with a 7-card hand, library count, commander in command zone", () => {
    renderPlaytest({ n: 10 });
    expect(screen.getByRole("dialog", { name: "Playtest" })).toBeInTheDocument();
    expect(screen.getByText("Hand (7)")).toBeInTheDocument();
    expect(screen.getByText("Library (3)")).toBeInTheDocument();
    expect(screen.getByText("Turn 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Life total")).toHaveTextContent("40");
    // Commander sits in the command pile.
    expect(
      screen.getByRole("button", { name: "Atraxa, Praetors' Voice" })
    ).toBeInTheDocument();
  });

  it("plays a card from hand to the battlefield via its menu, then taps it", () => {
    renderPlaytest();
    const handCard = screen.getAllByRole("button", { name: /^Card \d+$/ })[0];
    const name = handCard.getAttribute("aria-label");
    fireEvent.click(handCard);
    fireEvent.click(screen.getByRole("menuitem", { name: "Play" }));

    expect(screen.getByText("Hand (6)")).toBeInTheDocument();
    const played = screen.getByRole("button", { name });
    fireEvent.click(played); // battlefield click = tap
    expect(
      screen.getByRole("button", { name: `${name} (tapped)` })
    ).toBeInTheDocument();
  });

  it("draws, advances the turn (untap + draw), and tracks life", () => {
    renderPlaytest({ n: 10 });
    fireEvent.click(screen.getByRole("button", { name: "Draw" }));
    expect(screen.getByText("Hand (8)")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next Turn" }));
    expect(screen.getByText("Turn 2")).toBeInTheDocument();
    expect(screen.getByText("Hand (9)")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Lose a life" }));
    expect(screen.getByLabelText("Life total")).toHaveTextContent("39");
  });

  it("mulligans (first one is free) and restarts", () => {
    renderPlaytest({ n: 20 });
    fireEvent.click(screen.getByRole("button", { name: "Mulligan" }));
    expect(screen.getByText("Hand (7)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mulligan" }));
    expect(screen.getByText("Hand (6)")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Restart" }));
    expect(screen.getByText("Hand (7)")).toBeInTheDocument();
    expect(screen.getByText("Turn 1")).toBeInTheDocument();
  });

  it("discards to the graveyard and casts the commander", () => {
    renderPlaytest();
    const handCard = screen.getAllByRole("button", { name: /^Card \d+$/ })[0];
    fireEvent.click(handCard);
    fireEvent.click(screen.getByRole("menuitem", { name: "Discard" }));
    expect(screen.getByText(/Graveyard \(1\)/)).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Atraxa, Praetors' Voice" })
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Cast" }));
    // Commander is now a battlefield card; the command pile shows empty.
    expect(
      screen.getByRole("button", { name: "Atraxa, Praetors' Voice" })
    ).toBeInTheDocument();
  });

  it("confirms before closing via the X", () => {
    const { onClose } = renderPlaytest();
    fireEvent.click(screen.getByRole("button", { name: "Close playtest" }));
    // A confirmation appears first; the deck isn't torn down yet.
    expect(onClose).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", { name: "Close playtest?" });
    // Backing out keeps the game.
    fireEvent.click(within(dialog).getByRole("button", { name: "Keep playing" }));
    expect(onClose).not.toHaveBeenCalled();
    // Reopen and confirm.
    fireEvent.click(screen.getByRole("button", { name: "Close playtest" }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Close playtest?" })).getByRole("button", {
        name: "Leave",
      })
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("keyboard shortcuts: D draws, N next turn, M mulligan, R restarts", () => {
    renderPlaytest({ n: 20 });
    fireEvent.keyDown(window, { key: "d" });
    expect(screen.getByText("Hand (8)")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "n" });
    expect(screen.getByText("Turn 2")).toBeInTheDocument();
    expect(screen.getByText("Hand (9)")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "m" });
    expect(screen.getByText("Hand (7)")).toBeInTheDocument(); // free first mulligan

    fireEvent.keyDown(window, { key: "r" });
    expect(screen.getByText("Turn 1")).toBeInTheDocument();
    expect(screen.getByText("Hand (7)")).toBeInTheDocument();
  });

  it("shortcuts are ignored while typing in a field", () => {
    renderPlaytest();
    fireEvent.click(screen.getByRole("button", { name: /Add Token/ }));
    const input = screen.getByLabelText("Custom token name");
    fireEvent.keyDown(input, { key: "d" });
    fireEvent.keyDown(input, { key: "r" });
    expect(screen.getByText("Hand (7)")).toBeInTheDocument(); // no draw, no restart
  });

  it("adds a preset token, then removes it via its menu (tokens cease to exist)", () => {
    renderPlaytest();
    fireEvent.click(screen.getByRole("button", { name: /Add Token/ }));
    fireEvent.click(screen.getByRole("button", { name: "Treasure" }));
    const token = screen.getByRole("button", { name: "Treasure" }); // battlefield card
    fireEvent.click(screen.getByRole("button", { name: "Actions for Treasure" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove token" }));
    expect(screen.queryByRole("button", { name: "Treasure" })).not.toBeInTheDocument();
    expect(token).not.toBeInTheDocument();
  });

  it("adds a custom token from the input", () => {
    renderPlaytest();
    fireEvent.click(screen.getByRole("button", { name: /Add Token/ }));
    fireEvent.change(screen.getByLabelText("Custom token name"), {
      target: { value: "4/4 Angel" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByRole("button", { name: "4/4 Angel" })).toBeInTheDocument();
  });

  it("puts counters on a battlefield card via its menu", () => {
    renderPlaytest();
    const handCard = screen.getAllByRole("button", { name: /^Card \d+$/ })[0];
    const name = handCard.getAttribute("aria-label");
    fireEvent.click(handCard);
    fireEvent.click(screen.getByRole("menuitem", { name: "Play" }));

    // The menu stays open so counters can be clicked repeatedly.
    fireEvent.click(screen.getByRole("button", { name: `Actions for ${name}` }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Add counter" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Add counter" }));
    expect(screen.getByLabelText("2 counters")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("menuitem", { name: "Remove counter" }));
    expect(screen.getByLabelText("1 counters")).toBeInTheDocument();
  });

  it("tracks player counters from the Counters popover", () => {
    renderPlaytest();
    fireEvent.click(screen.getByRole("button", { name: "Counters ▾" }));
    const popover = screen.getByRole("dialog", { name: "Player counters" });
    fireEvent.click(within(popover).getByRole("button", { name: "Add Poison counter" }));
    fireEvent.click(within(popover).getByRole("button", { name: "Add Poison counter" }));
    expect(screen.getByText("poison 2")).toBeInTheDocument();
    fireEvent.click(
      within(popover).getByRole("button", { name: "Remove Poison counter" })
    );
    expect(screen.getByText("poison 1")).toBeInTheDocument();
  });

  it("views the library in order and pulls a card to hand", () => {
    renderPlaytest({ n: 10 });
    fireEvent.click(screen.getByRole("button", { name: "View Library" }));
    const viewer = screen.getByRole("dialog", { name: "Library" });
    expect(within(viewer).getByText(/Library \(3\)/)).toBeInTheDocument();
    // Card names render in the list (regression: they were white-on-white).
    expect(within(viewer).getAllByText(/^Card \d+$/).length).toBeGreaterThan(0);

    fireEvent.click(within(viewer).getAllByRole("button", { name: "Hand" })[0]);
    expect(within(viewer).getByText(/Library \(2\)/)).toBeInTheDocument();
    expect(screen.getByText("Hand (8)")).toBeInTheDocument();

    fireEvent.click(within(viewer).getByRole("button", { name: "Shuffle & close" }));
    expect(screen.queryByRole("dialog", { name: "Library" })).not.toBeInTheDocument();
  });

  it("filters the library view by card name", () => {
    renderPlaytest({ n: 12 });
    fireEvent.click(screen.getByRole("button", { name: "View Library" }));
    const viewer = screen.getByRole("dialog", { name: "Library" });
    const rows = () => [...viewer.querySelectorAll(".pt-library-row")];
    const before = rows().length;
    expect(before).toBeGreaterThan(1);

    // Filter by the first row's name; every visible row then contains it.
    const firstRowName = within(rows()[0]).getByText(/^Card \d+$/).textContent;
    fireEvent.change(within(viewer).getByLabelText("Filter library"), {
      target: { value: firstRowName },
    });
    const filtered = rows();
    expect(filtered.length).toBeGreaterThanOrEqual(1);
    expect(filtered.length).toBeLessThanOrEqual(before);
    filtered.forEach((r) => expect(r.textContent).toContain(firstRowName));

    // A non-matching filter shows the empty hint.
    fireEvent.change(within(viewer).getByLabelText("Filter library"), {
      target: { value: "zzzzz-nope" },
    });
    expect(rows().length).toBe(0);
    expect(within(viewer).getByText(/No cards match/)).toBeInTheDocument();
  });

  it("drags a card out of the library onto the battlefield", () => {
    renderPlaytest({ n: 10, resolveDropTarget: () => "battlefield" });
    fireEvent.click(screen.getByRole("button", { name: "View Library" }));
    const viewer = screen.getByRole("dialog", { name: "Library" });
    const row = viewer.querySelector(".pt-library-row");
    const name = within(row).getByText(/^Card \d+$/).textContent;

    dragCard(row);

    expect(within(viewer).getByText(/Library \(2\)/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name })).toBeInTheDocument(); // now on the field
  });

  it("views the graveyard in a side panel and drags a card out", () => {
    renderPlaytest({ resolveDropTarget: () => "hand" });
    // Discard a hand card so the graveyard has one.
    const handCard = within(screen.getByRole("region", { name: "Hand" })).getAllByRole(
      "button",
      { name: /^Card \d+$/ }
    )[0];
    const name = handCard.getAttribute("aria-label");
    fireEvent.click(handCard);
    fireEvent.click(screen.getByRole("menuitem", { name: "Discard" }));

    // Open the graveyard panel from its pile label.
    fireEvent.click(screen.getByRole("button", { name: /Graveyard \(1\)/ }));
    const panel = screen.getByRole("dialog", { name: "Graveyard" });
    const row = panel.querySelector(".pt-library-row");
    expect(within(row).getByText(name)).toBeInTheDocument();

    // Drag it back to hand.
    dragCard(row);
    expect(screen.getByText("Hand (7)")).toBeInTheDocument();
    expect(within(panel).getByText(/Viewing Graveyard \(0\)/)).toBeInTheDocument();
  });
});

describe("Playtest drag and drop", () => {
  it("a press that barely moves stays a click (opens the menu, no drag)", () => {
    renderPlaytest({ resolveDropTarget: () => "graveyard" });
    const handCard = screen.getAllByRole("button", { name: /^Card \d+$/ })[0];
    // Under the 5px threshold: not a drag.
    dragCard(handCard, { from: { x: 10, y: 10 }, to: { x: 12, y: 12 } });
    expect(document.querySelector(".pt-drag-ghost")).toBeNull();
    // The click that follows still opens the card's menu.
    fireEvent.click(handCard);
    expect(screen.getByRole("menuitem", { name: "Play" })).toBeInTheDocument();
    expect(screen.getByText("Hand (7)")).toBeInTheDocument(); // nothing moved
  });

  it("drags a card from hand to the battlefield", () => {
    renderPlaytest({ resolveDropTarget: () => "battlefield" });
    const handCard = screen.getAllByRole("button", { name: /^Card \d+$/ })[0];
    const name = handCard.getAttribute("aria-label");
    dragCard(handCard);
    expect(screen.getByText("Hand (6)")).toBeInTheDocument();
    // The card now lives on the battlefield with an absolute position.
    const played = screen.getByRole("button", { name });
    expect(played.closest(".pt-card-wrap")).toHaveStyle({ "--x": "16px" });
  });

  it("drags a hand card onto the graveyard pile to discard it", () => {
    renderPlaytest({ resolveDropTarget: () => "graveyard" });
    const handCard = screen.getAllByRole("button", { name: /^Card \d+$/ })[0];
    dragCard(handCard);
    expect(screen.getByText("Hand (6)")).toBeInTheDocument();
    expect(screen.getByText(/Graveyard \(1\)/)).toBeInTheDocument();
  });

  it("Escape cancels an in-flight drag, leaving state untouched", () => {
    const { onClose } = renderPlaytest({ resolveDropTarget: () => "graveyard" });
    const handCard = screen.getAllByRole("button", { name: /^Card \d+$/ })[0];
    fireEvent.pointerDown(handCard, { button: 0, pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(window, { clientX: 120, clientY: 90 });
    expect(document.querySelector(".pt-drag-ghost")).not.toBeNull();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(document.querySelector(".pt-drag-ghost")).toBeNull();
    // A release after the cancel drops nothing.
    fireEvent.pointerUp(window, { clientX: 120, clientY: 90 });
    expect(screen.getByText("Hand (7)")).toBeInTheDocument();
    expect(screen.getByText(/Graveyard \(0\)/)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled(); // Escape was consumed by the drag
  });

  it("suppresses the click that a completed drag synthesizes", () => {
    renderPlaytest({ resolveDropTarget: () => "battlefield" });
    // Play a card to the battlefield first (via its menu).
    const handCard = screen.getAllByRole("button", { name: /^Card \d+$/ })[0];
    const name = handCard.getAttribute("aria-label");
    fireEvent.click(handCard);
    fireEvent.click(screen.getByRole("menuitem", { name: "Play" }));
    const played = screen.getByRole("button", { name });

    // Reposition it (battlefield → battlefield), then the trailing click must
    // NOT toggle its tap state.
    dragCard(played, { from: { x: 40, y: 40 }, to: { x: 200, y: 160 } });
    fireEvent.click(played);
    expect(
      screen.queryByRole("button", { name: `${name} (tapped)` })
    ).not.toBeInTheDocument();
  });
});

describe("Playtest multi-select", () => {
  // Play the first hand card to the battlefield via its menu (auto-cascade
  // gives it a distinct position).
  const playOne = () => {
    const hand = within(screen.getByRole("region", { name: "Hand" }));
    fireEvent.click(hand.getAllByRole("button", { name: /^Card \d+$/ })[0]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Play" }));
  };
  const marqueeAll = () => {
    const field = document.querySelector(".pt-battlefield-cards");
    fireEvent.pointerDown(field, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(window, { clientX: 600, clientY: 600 });
    fireEvent.pointerUp(window, { clientX: 600, clientY: 600 });
  };
  const selectedCount = () =>
    document.querySelectorAll(".pt-battlefield-cards .pt-card-wrap.pt-selected").length;

  it("marquee-selects battlefield cards and taps them together", () => {
    renderPlaytest();
    playOne();
    playOne();
    marqueeAll();
    expect(selectedCount()).toBe(2);

    // Tapping one selected card taps the whole selection.
    fireEvent.click(document.querySelector(".pt-battlefield-cards .pt-card"));
    expect(screen.getAllByRole("button", { name: /\(tapped\)$/ })).toHaveLength(2);
  });

  it("drags a marquee selection to another zone together", () => {
    renderPlaytest({ resolveDropTarget: () => "graveyard" });
    playOne();
    playOne();
    marqueeAll();
    expect(selectedCount()).toBe(2);

    dragCard(document.querySelector(".pt-battlefield-cards .pt-card"));
    expect(screen.getByText(/Graveyard \(2\)/)).toBeInTheDocument();
    expect(selectedCount()).toBe(0); // selection cleared after the move
  });

  it("a click on empty battlefield clears the selection", () => {
    renderPlaytest();
    playOne();
    playOne();
    marqueeAll();
    expect(selectedCount()).toBe(2);

    // A press that doesn't travel is a click → clears.
    const field = document.querySelector(".pt-battlefield-cards");
    fireEvent.pointerDown(field, { button: 0, clientX: 400, clientY: 400 });
    fireEvent.pointerUp(window, { clientX: 401, clientY: 401 });
    expect(selectedCount()).toBe(0);
  });
});

describe("Playtest tap rotation", () => {
  it("keeps the action menu out of the rotated (tapped) layer", () => {
    renderPlaytest();
    const handCard = screen.getAllByRole("button", { name: /^Card \d+$/ })[0];
    const name = handCard.getAttribute("aria-label");
    fireEvent.click(handCard);
    fireEvent.click(screen.getByRole("menuitem", { name: "Play" }));

    const played = screen.getByRole("button", { name });
    fireEvent.click(played); // tap the battlefield card (rotates it)
    fireEvent.click(screen.getByRole("button", { name: `Actions for ${name}` }));

    const menu = screen.getByRole("menu");
    // The 90° rotation lives on .pt-card-tap; the menu must NOT be inside it,
    // so the menu stays upright.
    const rotated = document.querySelector(".pt-card-tap.tapped");
    expect(rotated).not.toBeNull();
    expect(rotated.contains(menu)).toBe(false);
    // It's still anchored to the (unrotated) card wrap.
    expect(menu.closest(".pt-card-wrap")).not.toBeNull();
  });
});

describe("Playtest card images", () => {
  const imgCard = (name) => ({
    name,
    mana_cost: "{1}",
    type_line: "Artifact",
    image_uris: { normal: `https://cards.scryfall.io/normal/${name}.jpg` },
  });

  it("renders the Scryfall image, falling back to the text frame on load error", () => {
    render(
      <Playtest
        deck={Array.from({ length: 8 }, (_, i) => ({
          name: `Img ${i}`,
          card: imgCard(`Img ${i}`),
        }))}
        commander={null}
        onClose={vi.fn()}
      />
    );
    const img = document.querySelector(".pt-hand-cards .pt-card img");
    expect(img).not.toBeNull();
    const wrap = img.closest(".pt-card-wrap");
    expect(wrap.querySelector(".pt-card-proxy")).toBeNull();

    // A failed image load swaps that card to its text frame.
    fireEvent.error(img);
    expect(wrap.querySelector(".pt-card img")).toBeNull();
    expect(wrap.querySelector(".pt-card-proxy")).not.toBeNull();
  });

  it("shows a larger preview of the card under the cursor", () => {
    render(
      <Playtest
        deck={Array.from({ length: 8 }, (_, i) => ({
          name: `Img ${i}`,
          card: imgCard(`Img ${i}`),
        }))}
        commander={null}
        onClose={vi.fn()}
      />
    );
    expect(document.querySelector(".pt-preview")).toBeNull();
    const wrap = document.querySelector(".pt-hand-cards .pt-card-wrap");

    fireEvent.mouseEnter(wrap);
    const preview = document.querySelector(".pt-preview");
    expect(preview).not.toBeNull();
    expect(preview.querySelector("img")).not.toBeNull();

    fireEvent.mouseLeave(wrap);
    expect(document.querySelector(".pt-preview")).toBeNull();
  });
});

describe("Playtest hand reordering", () => {
  it("reorders a hand card when dragged within the hand", () => {
    renderPlaytest({
      resolveDropTarget: () => "hand",
      resolveHandIndex: () => 0,
    });
    const hand = () => within(screen.getByRole("region", { name: "Hand" }));
    const names = () =>
      hand()
        .getAllByRole("button", { name: /^Card \d+$/ })
        .map((b) => b.getAttribute("aria-label"));

    const before = names();
    const third = hand().getAllByRole("button", { name: /^Card \d+$/ })[2];
    dragCard(third);

    const after = names();
    expect(after[0]).toBe(before[2]); // the dragged card jumped to the front
    expect([...after].sort()).toEqual([...before].sort()); // nothing lost
  });
});
