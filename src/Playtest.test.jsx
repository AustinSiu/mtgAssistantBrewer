import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import Playtest from "./Playtest";
import { card } from "../test/fixtures";

const deckOf = (n) =>
  Array.from({ length: n }, (_, i) => ({
    name: `Card ${i + 1}`,
    card: card(`Card ${i + 1}`, { type_line: "Artifact", mana_cost: "{1}" }),
  }));

function renderPlaytest({ n = 10, onClose = vi.fn() } = {}) {
  render(
    <Playtest
      deck={deckOf(n)}
      commander={{ name: "Atraxa, Praetors' Voice", card: card("Atraxa, Praetors' Voice") }}
      onClose={onClose}
    />
  );
  return { onClose };
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
    expect(screen.getByText("Graveyard (1)")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Atraxa, Praetors' Voice" })
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Cast" }));
    // Commander is now a battlefield card; the command pile shows empty.
    expect(
      screen.getByRole("button", { name: "Atraxa, Praetors' Voice" })
    ).toBeInTheDocument();
  });

  it("closes via the X", () => {
    const { onClose } = renderPlaytest();
    fireEvent.click(screen.getByRole("button", { name: "Close playtest" }));
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

    fireEvent.click(within(viewer).getAllByRole("button", { name: "Hand" })[0]);
    expect(within(viewer).getByText(/Library \(2\)/)).toBeInTheDocument();
    expect(screen.getByText("Hand (8)")).toBeInTheDocument();

    fireEvent.click(within(viewer).getByRole("button", { name: "Shuffle & close" }));
    expect(screen.queryByRole("dialog", { name: "Library" })).not.toBeInTheDocument();
  });
});
