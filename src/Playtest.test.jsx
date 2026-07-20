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

const handCards = () =>
  within(screen.getByRole("region", { name: "Hand" }) ?? document.body);

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
});
