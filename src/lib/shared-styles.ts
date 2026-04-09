/**
 * Unified dual-theme design system for outlook-mailbox.
 *
 * Light and dark themes via `data-theme="light|dark"` on <html>.
 * Default: dark. Persists choice in localStorage.
 */

export const FONT_IMPORT = `@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700;800&display=swap");`;

export const CSS_VARIABLES = `
  /* ---- light (default) ---- */
  :root,
  [data-theme="light"] {
    --bg: #FFFFFF;
    --bg-raised: #FFFFFF;
    --bg-card: rgba(246, 248, 250, 0.88);
    --bg-surface: #F3F4F6;
    --bg-hover: #E5E7EB;
    --bg-input: #FFFFFF;

    --border: rgba(0, 0, 0, 0.08);
    --border-strong: rgba(0, 0, 0, 0.15);
    --border-accent: rgba(0, 168, 132, 0.3);

    --text: #111318;
    --text-secondary: #111318;
    --text-tertiary: #111318;

    --accent: #00A884;
    --accent-dim: rgba(0, 168, 132, 0.1);
    --accent-hover: #009474;
    --accent-text: #FFFFFF;

    --success: #0F9D58;
    --success-dim: rgba(15, 157, 88, 0.1);
    --warning: #E37400;
    --warning-dim: rgba(227, 116, 0, 0.1);
    --danger: #D93025;
    --danger-dim: rgba(217, 48, 37, 0.1);

    --glow: none;
    --shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
    --shadow-lg: 0 8px 32px rgba(0, 0, 0, 0.1);
    --card-blur: blur(12px);

    color-scheme: light;
  }

  /* ---- dark ---- */
  [data-theme="dark"] {
    --bg: #0B0D11;
    --bg-raised: #111318;
    --bg-card: rgba(17, 19, 24, 0.85);
    --bg-surface: #161920;
    --bg-hover: #1c1f28;
    --bg-input: #0f1116;

    --border: rgba(255, 255, 255, 0.07);
    --border-strong: rgba(255, 255, 255, 0.14);
    --border-accent: rgba(0, 212, 170, 0.3);

    --text: #E8EAED;
    --text-secondary: rgba(232, 234, 237, 0.6);
    --text-tertiary: rgba(232, 234, 237, 0.38);

    --accent: #00D4AA;
    --accent-dim: rgba(0, 212, 170, 0.15);
    --accent-hover: #00E8BB;
    --accent-text: #0B0D11;

    --success: #34D399;
    --success-dim: rgba(52, 211, 153, 0.12);
    --warning: #FBBF24;
    --warning-dim: rgba(251, 191, 36, 0.12);
    --danger: #F87171;
    --danger-dim: rgba(248, 113, 113, 0.12);

    --glow: 0 0 80px rgba(0, 212, 170, 0.08);
    --shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    --shadow-lg: 0 16px 64px rgba(0, 0, 0, 0.5);
    --card-blur: blur(20px);

    --radius: 16px;
    --radius-sm: 12px;
    --radius-xs: 8px;

    --ease: cubic-bezier(0.16, 1, 0.3, 1);
    --dur: 200ms;

    color-scheme: dark;
  }
`;

export const CSS_RESET = `
  *, *::before, *::after {
    box-sizing: border-box;
  }

  html, body {
    margin: 0;
    min-height: 100vh;
    background: var(--bg);
    color: var(--text);
    font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    line-height: 1.5;
    font-size: 15px;
    transition: background-color 0.3s ease, color 0.3s ease;
  }

  body {
    position: relative;
    overflow-x: hidden;
  }

  /* ambient glow — dark only */
  body::before {
    content: "";
    position: fixed;
    top: -40%;
    left: -20%;
    width: 80%;
    height: 80%;
    background: radial-gradient(ellipse, rgba(0, 212, 170, 0.04) 0%, transparent 70%);
    pointer-events: none;
    z-index: 0;
  }

  [data-theme="light"] body::before {
    background: radial-gradient(ellipse, rgba(0, 168, 132, 0.03) 0%, transparent 70%);
  }

  button, input, textarea, select {
    font: inherit;
    color: inherit;
  }

  a {
    color: var(--accent);
    text-decoration: none;
    transition: color var(--dur) ease;
  }

  a:hover {
    color: var(--accent-hover);
  }
`;

export const CSS_LAYOUT = `
  .shell {
    width: min(1200px, calc(100vw - 48px));
    margin: 0 auto;
    padding: 24px 0 48px;
    position: relative;
    z-index: 1;
  }

  .shell--narrow {
    width: min(960px, calc(100vw - 48px));
  }

  .shell--compact {
    width: min(560px, calc(100vw - 48px));
  }
`;

export const CSS_NAV = `
  .app-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 0 24px;
    height: 64px;
    background: var(--bg-raised);
    border-bottom: 1px solid var(--border);
    position: sticky;
    top: 0;
    z-index: 50;
  }

  .app-branding {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .brand-title {
    font-family: "JetBrains Mono", monospace;
    font-weight: 700;
    font-size: 1.1rem;
    color: var(--text);
    letter-spacing: -0.02em;
    margin: 0;
  }

  .mode-switcher {
    display: flex;
    background: var(--bg-surface);
    padding: 4px;
    border-radius: 99px;
    border: 1px solid var(--border);
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    gap: 4px;
  }

  .mode-tab {
    padding: 6px 18px;
    font-size: 0.88rem;
    font-weight: 600;
    color: var(--text-secondary);
    border-radius: 99px;
    cursor: pointer;
    transition: all 0.2s ease;
    background: transparent;
    border: none;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .mode-tab:hover {
    color: var(--text);
  }

  .mode-tab.active {
    background: var(--bg-raised);
    color: var(--text);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
  }

  [data-theme="dark"] .mode-tab.active {
    background: var(--bg-card);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }

  .mode-tab.active .tab-icon {
    color: var(--accent);
  }

  .app-actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .view-container {
    display: none;
    animation: fade-in 0.3s ease;
  }

  .view-container.active {
    display: block;
  }


  .status-dot {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 12px;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    border: 1px solid var(--border);
    background: var(--bg-surface);
    color: var(--text-secondary);
  }

  .status-dot::before {
    content: "";
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--text-tertiary);
    flex-shrink: 0;
  }

  .status-dot.is-ready::before { background: var(--success); box-shadow: 0 0 8px var(--success); }
  .status-dot.is-waiting::before { background: var(--warning); box-shadow: 0 0 8px var(--warning); }
  .status-dot.is-alert::before { background: var(--danger); box-shadow: 0 0 8px var(--danger); }

  .nav-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    border-radius: 99px;
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--text-secondary);
    background: transparent;
    border: 1px solid transparent;
    cursor: pointer;
    transition: all var(--dur) ease;
    text-decoration: none;
  }

  .nav-link:hover {
    color: var(--text);
    background: var(--bg-hover);
  }

  /* theme toggle */
  .theme-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: var(--radius-xs);
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 1.1rem;
    transition: all var(--dur) ease;
    padding: 0;
    line-height: 1;
  }

  .theme-toggle:hover {
    color: var(--text);
    background: var(--bg-hover);
    border-color: var(--border-strong);
  }
`;

export const CSS_CARD = `
  .card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 24px;
    backdrop-filter: var(--card-blur);
    -webkit-backdrop-filter: var(--card-blur);
    transition: border-color var(--dur) ease, background-color 0.3s ease;
  }

  .card:hover {
    border-color: var(--border-strong);
  }

  .card-header {
    margin-bottom: 20px;
  }

  .card-title {
    display: block;
    margin: 0 0 6px 0;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-tertiary);
  }

  .card h2 {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 600;
    letter-spacing: -0.01em;
    color: var(--text);
  }

  .card p {
    margin: 0 0 16px 0;
    color: var(--text-secondary);
    font-size: 0.88rem;
    line-height: 1.65;
  }

  .card p:last-child {
    margin-bottom: 0;
  }
`;

export const CSS_BUTTONS = `
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 10px 18px;
    border-radius: var(--radius-xs);
    font-size: 0.875rem;
    font-weight: 600;
    border: 1px solid var(--border);
    background: var(--bg-surface);
    color: var(--text);
    cursor: pointer;
    transition: all var(--dur) ease;
    text-decoration: none;
    white-space: nowrap;
  }

  .btn:hover {
    background: var(--bg-hover);
    border-color: var(--border-strong);
    color: var(--text);
  }

  .btn:active {
    transform: scale(0.98);
  }

  .btn-primary {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accent-text);
    font-weight: 700;
  }

  .btn-primary:hover {
    background: var(--accent-hover);
    border-color: var(--accent-hover);
    color: var(--accent-text);
    box-shadow: 0 0 20px var(--accent-dim);
  }

  .btn-primary:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    box-shadow: none;
  }

  .btn-primary:disabled:hover {
    background: var(--accent);
    transform: none;
  }

  .btn-lg {
    min-height: 52px;
    padding: 14px 28px;
    font-size: 0.95rem;
    border-radius: var(--radius-sm);
  }

  .btn-group {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
`;

export const CSS_META = `
  .meta-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 1px;
    background: var(--border);
    border-radius: var(--radius-sm);
    overflow: hidden;
    margin-top: 16px;
  }

  .main-recent-codes {
    margin-top: 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  
  .inline-recent-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    background: var(--bg-surface);
    border: 1px dashed var(--border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all var(--dur) ease;
  }
  
  .inline-recent-card:hover {
    border-color: var(--border-strong);
    background: var(--bg-hover);
  }
  
  .inline-recent-code {
    font-family: "JetBrains Mono", monospace;
    font-size: 1.1rem;
    font-weight: 700;
    color: var(--text);
    letter-spacing: 0.05em;
  }
  
  .inline-recent-meta {
    font-size: 0.75rem;
    color: var(--text-tertiary);
    text-align: right;
    line-height: 1.4;
  }


  .meta-cell {
    background: var(--bg-surface);
    padding: 14px 16px;
    transition: background-color 0.3s ease;
  }

  .meta-cell--full {
    grid-column: 1 / -1;
  }

  .meta-label {
    display: block;
    font-size: 0.68rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-tertiary);
    margin-bottom: 6px;
  }

  .meta-value {
    display: block;
    font-size: 0.88rem;
    color: var(--text);
    word-break: break-word;
  }
`;

export const CSS_LIST = `
  .list-group {
    display: grid;
    gap: 6px;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .list-item {
    display: grid;
    gap: 3px;
    padding: 11px 14px;
    border-radius: var(--radius-xs);
    background: var(--bg-surface);
    border: 1px solid transparent;
    transition: all var(--dur) ease;
  }

  .list-item:hover {
    border-color: var(--border-strong);
    background: var(--bg-hover);
  }

  .list-item-title {
    font-family: "JetBrains Mono", monospace;
    font-size: 0.92rem;
    font-weight: 600;
    color: var(--text);
  }

  .list-item-meta {
    font-size: 0.76rem;
    color: var(--text-tertiary);
    line-height: 1.4;
  }

  .list-empty {
    color: var(--text-tertiary);
    font-size: 0.84rem;
    padding: 6px 0;
  }

  .section-title {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--text-tertiary);
    margin: 0 0 10px;
  }
`;

export const CSS_STATUS = `
  .feedback {
    min-height: 20px;
    font-size: 0.82rem;
    color: var(--text-tertiary);
    transition: color var(--dur) ease;
  }

  .feedback[data-tone="success"] { color: var(--success); }
  .feedback[data-tone="error"] { color: var(--danger); }
`;

export const CSS_SKELETON = `
  .skel {
    background: var(--bg-hover);
    border-radius: var(--radius-xs);
    position: relative;
    overflow: hidden;
  }

  .skel::after {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, transparent, rgba(128,128,128,0.06), transparent);
    animation: skel-shimmer 1.8s ease-in-out infinite;
  }

  @keyframes skel-shimmer {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
  }
`;

export const CSS_SYNC = `
  .sync-bar {
    position: fixed;
    top: 0;
    left: 0;
    height: 2px;
    background: var(--accent);
    z-index: 100;
    transition: width 300ms linear;
    box-shadow: 0 0 12px var(--accent-dim);
  }

  .sync-bar.is-syncing {
    animation: sync-glow 1s ease-in-out infinite;
  }

  @keyframes sync-glow {
    0%, 100% { opacity: 0.7; }
    50% { opacity: 1; }
  }
`;

export const CSS_FORMS = `
  .input {
    width: 100%;
    padding: 10px 14px;
    border-radius: var(--radius-xs);
    border: 1px solid var(--border);
    background: var(--bg-input);
    color: var(--text);
    font-size: 0.9rem;
    transition: border-color var(--dur) ease, box-shadow var(--dur) ease;
  }

  .input:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-dim);
  }

  .input::placeholder { color: var(--text-tertiary); }
`;

export const CSS_CODE = `
  code {
    font-family: "JetBrains Mono", monospace;
    font-size: 0.88em;
  }

  pre {
    padding: 14px 16px;
    border-radius: var(--radius-xs);
    background: var(--bg-input);
    border: 1px solid var(--border);
    color: var(--text-secondary);
    overflow-x: auto;
    white-space: pre-wrap;
    font-size: 0.82rem;
    line-height: 1.6;
  }
`;

export const CSS_ANIMATIONS = `
  @keyframes fade-in {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .animate-in { animation: fade-in 0.4s var(--ease) both; }
  .delay-1 { animation-delay: 0.05s; }
  .delay-2 { animation-delay: 0.1s; }
  .delay-3 { animation-delay: 0.15s; }
  .delay-4 { animation-delay: 0.2s; }
`;

export const CSS_RESPONSIVE = `
  @media (max-width: 768px) {
    .shell, .shell--narrow {
      width: calc(100vw - 24px);
      padding-top: 16px;
    }

    .topbar {
      flex-wrap: wrap;
      gap: 10px;
    }

    .topbar-right {
      width: 100%;
      justify-content: flex-end;
    }

    .meta-grid {
      grid-template-columns: 1fr 1fr;
    }
  }
`;

export function baseStyles(): string {
  return [
    FONT_IMPORT,
    CSS_VARIABLES,
    CSS_RESET,
    CSS_LAYOUT,
    CSS_NAV,
    CSS_CARD,
    CSS_BUTTONS,
    CSS_META,
    CSS_LIST,
    CSS_STATUS,
    CSS_SKELETON,
    CSS_SYNC,
    CSS_FORMS,
    CSS_CODE,
    CSS_ANIMATIONS,
    CSS_RESPONSIVE,
  ].join("\n");
}

/**
 * Inline JS for theme toggle. Include once per page inside <script>.
 * Reads/writes localStorage key "otp-panel-theme".
 */
export const JS_THEME_TOGGLE = `
  (function() {
    var STORAGE_KEY = "otp-panel-theme";
    var root = document.documentElement;
    var saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") {
      root.setAttribute("data-theme", saved);
    }

    window.__toggleTheme = function() {
      var current = root.getAttribute("data-theme") || "light";
      var next = current === "light" ? "dark" : "light";
      root.setAttribute("data-theme", next);
      localStorage.setItem(STORAGE_KEY, next);
      var btn = document.getElementById("theme-toggle");
      if (btn) btn.textContent = next === "light" ? "☾" : "☀";
    };

    // set initial icon
    document.addEventListener("DOMContentLoaded", function() {
      var btn = document.getElementById("theme-toggle");
      var theme = root.getAttribute("data-theme") || "light";
      if (btn) btn.textContent = theme === "light" ? "☾" : "☀";
    });
  })();
`;
