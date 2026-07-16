import { useState } from "react";
import DeckBrewer from "./DeckBrewer";
import DeckList from "./DeckList";
import HypergeometricCalculator from "./HypergeometricCalculator";
import "./App.css";

const TABS = [
  ["brewer", "Deck Brewer"],
  ["list", "Deck List"],
  ["calculator", "Hypergeometric Calculator"],
];

function App() {
  const [tab, setTab] = useState("brewer");

  return (
    <div className="app">
      <nav className="tabs">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? "tab active" : "tab"}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* Keep all mounted so form state survives tab switches */}
      <div hidden={tab !== "brewer"}>
        <DeckBrewer />
      </div>
      <div hidden={tab !== "list"}>
        <DeckList />
      </div>
      <div hidden={tab !== "calculator"} className="calc-pane">
        <HypergeometricCalculator />
      </div>
    </div>
  );
}

export default App;
