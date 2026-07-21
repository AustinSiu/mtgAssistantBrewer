import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import DeckStats from "./DeckStats";
import { card } from "../test/fixtures";

describe("DeckStats", () => {
  it("shows the mana curve and per-color symbol breakdown", () => {
    render(
      <DeckStats
        cards={[
          card("Cultivate", { type_line: "Sorcery", mana_cost: "{2}{G}", cmc: 3 }),
          card("Forest", {
            type_line: "Basic Land — Forest",
            mana_cost: "",
            cmc: 0,
            produced_mana: ["G"],
          }),
        ]}
      />
    );
    const region = screen.getByRole("region", { name: "Deck stats" });
    expect(within(region).getByText("Deck Stats")).toBeInTheDocument();
    expect(within(region).getByText(/Mana curve/)).toBeInTheDocument();
    expect(within(region).getByText("Green")).toBeInTheDocument();
    // Green is the only coloured pip → 100% of symbols; Forest produces it.
    expect(within(region).getByText("100%")).toBeInTheDocument();
    expect(within(region).getByText("1 produce")).toBeInTheDocument();
  });
});
