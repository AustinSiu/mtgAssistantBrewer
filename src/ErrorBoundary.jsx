import { Component } from "react";

// GitHub Pages can't set custom cache headers, so after a deploy the browser
// may re-run a stale index.html/bundle and crash on mount. Rather than leave a
// blank page that only a manual cache-clear fixes, catch the crash and force a
// single hard reload to pull the fresh index.html + hashed assets. A timestamp
// guard prevents an infinite reload loop if the crash is genuine, not stale.
const RELOAD_KEY = "eb-last-reload";
const RELOAD_WINDOW_MS = 10_000;

class ErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
    if (Date.now() - last > RELOAD_WINDOW_MS) {
      sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
      window.location.reload();
      return;
    }
    // Recently reloaded already — the error is real, so stop looping.
    console.error("App crashed after reload:", error);
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="app">
          <h1>Something went wrong</h1>
          <p>Reloading the latest version…</p>
          <button className="preset" onClick={() => window.location.reload()}>
            Reload now
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
