import { useState } from "react";
import DeckBrewer from "./DeckBrewer";
import LandCalculator from "./LandCalculator";
import "./App.css";

function App() {
  const [tab, setTab] = useState("brewer");

  return (
    <div className="app">
      <nav className="tabs">
        <button
          className={tab === "brewer" ? "tab active" : "tab"}
          onClick={() => setTab("brewer")}
        >
          Deck Brewer
        </button>
        <button
          className={tab === "calculator" ? "tab active" : "tab"}
          onClick={() => setTab("calculator")}
        >
          Land Calculator
        </button>
      </nav>

      {/* Keep both mounted so form state survives tab switches */}
      <div hidden={tab !== "brewer"}>
        <DeckBrewer />
      </div>
      <div hidden={tab !== "calculator"} className="calc-pane">
        <LandCalculator />
      </div>
    </div>
  );
}

export default App;
