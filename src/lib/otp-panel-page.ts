export function renderOtpPanelPage(): string {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1, viewport-fit=cover"
    />
    <title>OTP Panel</title>
    <style>
      @import url("https://fonts.googleapis.com/css2?family=Azeret+Mono:wght@400;500;700;800&family=Fraunces:opsz,wght@9..144,500;9..144,700&display=swap");

      :root {
        --paper: #efe7d7;
        --paper-strong: #e2d3b5;
        --ink: #171411;
        --ink-soft: rgba(23, 20, 17, 0.72);
        --grid: rgba(23, 20, 17, 0.1);
        --success: #0c6b3e;
        --success-soft: rgba(12, 107, 62, 0.14);
        --warning: #8f5b16;
        --warning-soft: rgba(143, 91, 22, 0.14);
        --danger: #9a2f26;
        --danger-soft: rgba(154, 47, 38, 0.14);
        --panel: rgba(255, 251, 245, 0.72);
        --shadow: 0 24px 80px rgba(33, 24, 14, 0.14);
        --radius: 24px;
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        margin: 0;
        min-height: 100%;
        color: var(--ink);
        background:
          radial-gradient(circle at top left, rgba(255, 255, 255, 0.45), transparent 28%),
          linear-gradient(180deg, #f6f1e8 0%, var(--paper) 45%, #e7dcc8 100%);
      }

      body {
        font-family: "Azeret Mono", "SFMono-Regular", "Consolas", monospace;
        position: relative;
        overflow-x: hidden;
      }

      body::before,
      body::after {
        content: "";
        position: fixed;
        inset: 0;
        pointer-events: none;
      }

      body::before {
        background:
          linear-gradient(var(--grid) 1px, transparent 1px),
          linear-gradient(90deg, var(--grid) 1px, transparent 1px);
        background-size: 32px 32px;
        mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.32), transparent 82%);
      }

      body::after {
        opacity: 0.18;
        background-image:
          radial-gradient(circle at 20% 20%, rgba(255, 255, 255, 0.75) 0 2px, transparent 2px),
          radial-gradient(circle at 80% 30%, rgba(23, 20, 17, 0.12) 0 1px, transparent 1px),
          radial-gradient(circle at 40% 80%, rgba(23, 20, 17, 0.08) 0 1px, transparent 1px);
        background-size: 160px 160px, 120px 120px, 180px 180px;
      }

      button,
      input,
      textarea {
        font: inherit;
      }

      .shell {
        width: min(1180px, calc(100vw - 32px));
        margin: 0 auto;
        padding: 28px 0 40px;
      }

      .masthead {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 20px;
      }

      .titleblock {
        display: grid;
        gap: 6px;
      }

      .eyebrow {
        letter-spacing: 0.18em;
        text-transform: uppercase;
        font-size: 11px;
        color: var(--ink-soft);
      }

      .headline {
        font-family: "Fraunces", Georgia, serif;
        font-size: clamp(2rem, 4.6vw, 4.1rem);
        line-height: 0.92;
        margin: 0;
        letter-spacing: -0.06em;
        max-width: 12ch;
      }

      .subhead {
        margin: 0;
        max-width: 46rem;
        color: var(--ink-soft);
        font-size: 0.95rem;
        line-height: 1.6;
      }

      .controls {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
        justify-content: flex-end;
      }

      .pill,
      .action {
        border: 1px solid rgba(23, 20, 17, 0.16);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.4);
        backdrop-filter: blur(12px);
      }

      .pill {
        padding: 10px 14px;
        font-size: 0.78rem;
        color: var(--ink-soft);
        text-transform: uppercase;
        letter-spacing: 0.12em;
      }

      .action {
        color: var(--ink);
        padding: 12px 16px;
        cursor: pointer;
        transition:
          transform 180ms ease,
          background-color 180ms ease,
          border-color 180ms ease;
      }

      .action:hover {
        transform: translateY(-1px);
        background: rgba(255, 255, 255, 0.62);
      }

      .action:active {
        transform: translateY(0);
      }

      .board {
        display: grid;
        grid-template-columns: minmax(0, 1.5fr) minmax(320px, 0.9fr);
        gap: 18px;
        align-items: start;
      }

      .panel {
        position: relative;
        border: 1px solid rgba(23, 20, 17, 0.14);
        border-radius: var(--radius);
        background: var(--panel);
        box-shadow: var(--shadow);
        overflow: hidden;
        animation: fade-rise 420ms cubic-bezier(.2, .8, .2, 1) both;
      }

      .panel::before {
        content: "";
        position: absolute;
        inset: 0;
        background:
          linear-gradient(135deg, rgba(255, 255, 255, 0.42), transparent 28%),
          linear-gradient(180deg, rgba(255, 255, 255, 0.18), transparent 32%);
        pointer-events: none;
      }

      .hero {
        padding: 22px;
        display: grid;
        gap: 16px;
        align-content: start;
      }

      .hero-top {
        display: grid;
        gap: 10px;
      }

      .hero-label {
        display: grid;
        gap: 8px;
      }

      .section-kicker {
        text-transform: uppercase;
        letter-spacing: 0.18em;
        font-size: 11px;
        color: var(--ink-soft);
      }

      .hero-title {
        margin: 0;
        font-family: "Fraunces", Georgia, serif;
        font-size: clamp(1.7rem, 3.6vw, 3rem);
        line-height: 0.98;
        letter-spacing: -0.05em;
      }

      .hero-note {
        margin: 0;
        color: var(--ink-soft);
        font-size: 0.88rem;
        line-height: 1.55;
      }

      .summary-strip {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
      }

      .summary-chip {
        border-radius: 18px;
        border: 1px solid rgba(23, 20, 17, 0.12);
        background: rgba(255, 255, 255, 0.45);
        padding: 12px 14px;
        min-height: 92px;
      }

      .summary-chip span {
        display: block;
      }

      .summary-chip .chip-label {
        font-size: 0.68rem;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        color: var(--ink-soft);
        margin-bottom: 8px;
      }

      .summary-chip .chip-value {
        font-size: 1.25rem;
        font-weight: 700;
      }

      .code-card {
        position: relative;
        border-radius: 26px;
        border: 1px solid rgba(23, 20, 17, 0.14);
        background:
          linear-gradient(180deg, rgba(255, 252, 247, 0.94), rgba(243, 236, 224, 0.92));
        padding: 18px;
        display: grid;
        gap: 12px;
      }

      .code-card::after {
        content: "";
        position: absolute;
        inset: 14px;
        border: 1px dashed rgba(23, 20, 17, 0.16);
        border-radius: 18px;
        pointer-events: none;
      }

      .code-stack {
        position: relative;
        z-index: 1;
        display: grid;
        gap: 14px;
      }

      .code-window {
        min-height: 188px;
        border-radius: 18px;
        background: #11110f;
        color: #f7f3ec;
        display: grid;
        align-items: center;
        justify-items: center;
        padding: 18px;
        text-align: center;
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.06),
          0 24px 42px rgba(23, 20, 17, 0.18);
      }

      .code-window code {
        display: block;
        font-size: clamp(2.9rem, 8vw, 6.2rem);
        line-height: 0.9;
        letter-spacing: 0.16em;
        text-indent: 0.16em;
        font-weight: 800;
      }

      .code-window small {
        display: block;
        margin-top: 10px;
        color: rgba(247, 243, 236, 0.7);
        letter-spacing: 0.08em;
        text-transform: uppercase;
        font-size: 0.68rem;
      }

      .meta-grid {
        position: relative;
        z-index: 1;
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }

      .meta-item {
        border-radius: 16px;
        background: rgba(23, 20, 17, 0.05);
        padding: 12px 14px;
        min-height: 78px;
      }

      .meta-item strong,
      .meta-item span {
        display: block;
      }

      .meta-item strong {
        color: var(--ink-soft);
        font-size: 0.7rem;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        margin-bottom: 8px;
      }

      .meta-item span {
        font-size: 0.9rem;
        line-height: 1.45;
        word-break: break-word;
      }

      .hero-actions {
        position: relative;
        z-index: 1;
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 12px;
        align-items: center;
      }

      .copy-button {
        appearance: none;
        border: none;
        border-radius: 18px;
        background: linear-gradient(180deg, #211c17 0%, #14120f 100%);
        color: #f8f5ef;
        min-height: 60px;
        padding: 16px 22px;
        font-size: 1rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        cursor: pointer;
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.08),
          0 16px 32px rgba(23, 20, 17, 0.22);
        transition:
          transform 180ms ease,
          box-shadow 180ms ease,
          opacity 180ms ease,
          background-color 180ms ease;
      }

      .copy-button::after {
        content: " ↗";
      }

      .copy-button:hover:not(:disabled) {
        transform: translateY(-1px);
        box-shadow: 0 18px 36px rgba(23, 20, 17, 0.28);
      }

      .copy-button:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }

      .copy-feedback {
        min-height: 1.5em;
        font-size: 0.82rem;
        color: var(--ink-soft);
        text-align: right;
      }

      .copy-feedback.success {
        color: var(--success);
      }

      .copy-feedback.error {
        color: var(--danger);
      }

      .rail {
        display: grid;
        gap: 14px;
      }

      .state-panel,
      .list-panel {
        padding: 20px;
      }

      .state-panel {
        min-height: 240px;
        display: grid;
        align-content: start;
        gap: 14px;
      }

      .state-banner {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 10px 14px;
        border-radius: 999px;
        font-size: 0.76rem;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        width: fit-content;
      }

      .state-panel h2 {
        margin: 0;
        font-family: "Fraunces", Georgia, serif;
        font-size: 1.55rem;
        letter-spacing: -0.04em;
      }

      .state-panel p {
        margin: 0;
        color: var(--ink-soft);
        line-height: 1.65;
        font-size: 0.92rem;
      }

      .state-panel.is-ready {
        background:
          linear-gradient(180deg, rgba(12, 107, 62, 0.08), rgba(255, 251, 245, 0.72));
      }

      .state-panel.is-ready .state-banner {
        background: var(--success-soft);
        color: var(--success);
      }

      .state-panel.is-waiting {
        background:
          linear-gradient(180deg, rgba(143, 91, 22, 0.08), rgba(255, 251, 245, 0.72));
      }

      .state-panel.is-waiting .state-banner {
        background: var(--warning-soft);
        color: var(--warning);
      }

      .state-panel.is-alert,
      .state-panel.is-error {
        background:
          linear-gradient(180deg, rgba(154, 47, 38, 0.08), rgba(255, 251, 245, 0.72));
      }

      .state-panel.is-alert .state-banner,
      .state-panel.is-error .state-banner {
        background: var(--danger-soft);
        color: var(--danger);
      }

      .state-panel.is-empty .state-banner {
        background: rgba(23, 20, 17, 0.08);
        color: var(--ink-soft);
      }

      .list-panel h3 {
        margin: 0 0 14px;
        font-size: 0.94rem;
        text-transform: uppercase;
        letter-spacing: 0.14em;
        color: var(--ink-soft);
      }

      .stack-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 10px;
      }

      .stack-item {
        border-radius: 16px;
        border: 1px solid rgba(23, 20, 17, 0.1);
        background: rgba(255, 255, 255, 0.46);
        padding: 14px;
        display: grid;
        gap: 6px;
        transition:
          transform 180ms ease,
          background-color 180ms ease,
          border-color 180ms ease;
      }

      .stack-item:hover {
        transform: translateY(-1px);
        background: rgba(255, 255, 255, 0.62);
      }

      .stack-item strong,
      .stack-item span,
      .stack-item small {
        display: block;
      }

      .stack-item strong {
        font-size: 1rem;
      }

      .stack-item small {
        color: var(--ink-soft);
        line-height: 1.5;
      }

      .empty-note {
        margin: 0;
        color: var(--ink-soft);
        line-height: 1.6;
        font-size: 0.9rem;
      }

      @keyframes fade-rise {
        from {
          opacity: 0;
          transform: translateY(10px);
        }

        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      @media (max-width: 920px) {
        .board {
          grid-template-columns: 1fr;
        }

        .rail {
          grid-template-columns: 1fr;
        }
      }

      @media (max-width: 720px) {
        .shell {
          width: min(100vw - 20px, 100%);
          padding-top: 18px;
          padding-bottom: 28px;
        }

        .headline {
          font-size: clamp(1.45rem, 10vw, 2.7rem);
          max-width: none;
        }

        .subhead {
          font-size: 0.9rem;
        }

        .masthead {
          gap: 12px;
          margin-bottom: 14px;
        }

        .masthead,
        .hero-top {
          display: grid;
          grid-template-columns: 1fr;
        }

        .controls {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          justify-content: stretch;
          align-items: center;
        }

        .controls > * {
          width: auto;
        }

        .hero-actions {
          grid-template-columns: 1fr;
        }

        .summary-strip {
          grid-template-columns: 1fr 1fr 1fr;
        }

        .meta-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .meta-item {
          min-height: 72px;
        }

        .copy-feedback {
          text-align: left;
        }

        .copy-button {
          width: 100%;
        }

        .code-window {
          min-height: 154px;
        }

        .code-window code {
          font-size: clamp(2.3rem, 14vw, 4.3rem);
        }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <header class="masthead">
        <div class="titleblock">
          <div class="eyebrow">Outlook Mailbox / OTP Panel</div>
          <h1 class="headline">See code. Copy. Leave.</h1>
          <p class="subhead">
            这是一个直接面向验证码动作的工具页，不是邮件后台。主任务只有一个，
            打开后立刻确认最新 code，点一下复制，然后离开。
          </p>
        </div>
        <div class="controls">
          <div class="pill" id="status-pill">Syncing panel...</div>
          <button class="action" id="refresh-button" type="button">Refresh</button>
        </div>
      </header>

      <main class="board">
        <section class="panel hero">
          <div class="hero-top">
            <div class="hero-label">
              <div class="section-kicker">Primary Card</div>
              <h2 class="hero-title" id="hero-title">Latest verification code</h2>
              <p class="hero-note" id="hero-note">
                首屏只服务 scan-and-copy，不让历史和异常信息抢走主位。
              </p>
            </div>
          </div>

          <div class="code-card">
            <div class="code-stack">
              <div class="code-window" id="code-window">
                <div>
                  <code id="code-display">------</code>
                  <small id="code-caption">Waiting for panel data</small>
                </div>
              </div>

              <div class="hero-actions">
                <button class="copy-button" id="copy-button" type="button" disabled>
                  Copy latest code
                </button>
                <div class="copy-feedback" id="copy-feedback" aria-live="polite"></div>
              </div>

              <div class="meta-grid">
                <div class="meta-item">
                  <strong>Source mailbox</strong>
                  <span id="meta-mailbox">--</span>
                </div>
                <div class="meta-item">
                  <strong>Received</strong>
                  <span id="meta-received">--</span>
                </div>
                <div class="meta-item">
                  <strong>Signal type</strong>
                  <span id="meta-signal">--</span>
                </div>
                <div class="meta-item">
                  <strong>Coverage</strong>
                  <span id="meta-coverage">--</span>
                </div>
              </div>
            </div>
          </div>

          <div class="summary-strip">
            <div class="summary-chip">
              <span class="chip-label">Current codes</span>
              <span class="chip-value" id="metric-codes">0</span>
            </div>
            <div class="summary-chip">
              <span class="chip-label">Mailboxes</span>
              <span class="chip-value" id="metric-mailboxes">0</span>
            </div>
            <div class="summary-chip">
              <span class="chip-label">Unhealthy</span>
              <span class="chip-value" id="metric-unhealthy">0</span>
            </div>
          </div>
        </section>

        <section class="rail">
          <section class="panel state-panel is-empty" id="state-panel">
            <div class="state-banner" id="state-badge">No data yet</div>
            <h2 id="state-title">Panel is waking up</h2>
            <p id="state-description">
              页面会自动读取 /api/otp-panel。准备好后，主卡会直接切成可复制状态。
            </p>
            <p id="generated-at">Last sync: --</p>
          </section>

          <section class="panel list-panel">
            <h3>Recent Codes</h3>
            <ul class="stack-list" id="recent-codes"></ul>
            <p class="empty-note" id="recent-codes-empty">暂无历史验证码。</p>
          </section>

          <section class="panel list-panel">
            <h3>Secondary Signals</h3>
            <ul class="stack-list" id="secondary-signals"></ul>
            <p class="empty-note" id="secondary-signals-empty">当前没有次级 signal。</p>
          </section>

          <section class="panel list-panel">
            <h3>Mailbox Health</h3>
            <ul class="stack-list" id="mailbox-health"></ul>
            <p class="empty-note" id="mailbox-health-empty">还没有 mailbox 数据。</p>
          </section>
        </section>
      </main>
    </div>

    <script>
      const state = {
        panel: null,
        copying: false,
        refreshTimer: null,
      };

      const elements = {
        statusPill: document.getElementById("status-pill"),
        refreshButton: document.getElementById("refresh-button"),
        heroTitle: document.getElementById("hero-title"),
        heroNote: document.getElementById("hero-note"),
        codeDisplay: document.getElementById("code-display"),
        codeCaption: document.getElementById("code-caption"),
        metaMailbox: document.getElementById("meta-mailbox"),
        metaReceived: document.getElementById("meta-received"),
        metaSignal: document.getElementById("meta-signal"),
        metaCoverage: document.getElementById("meta-coverage"),
        metricCodes: document.getElementById("metric-codes"),
        metricMailboxes: document.getElementById("metric-mailboxes"),
        metricUnhealthy: document.getElementById("metric-unhealthy"),
        copyButton: document.getElementById("copy-button"),
        copyFeedback: document.getElementById("copy-feedback"),
        statePanel: document.getElementById("state-panel"),
        stateBadge: document.getElementById("state-badge"),
        stateTitle: document.getElementById("state-title"),
        stateDescription: document.getElementById("state-description"),
        generatedAt: document.getElementById("generated-at"),
        recentCodes: document.getElementById("recent-codes"),
        recentCodesEmpty: document.getElementById("recent-codes-empty"),
        secondarySignals: document.getElementById("secondary-signals"),
        secondarySignalsEmpty: document.getElementById("secondary-signals-empty"),
        mailboxHealth: document.getElementById("mailbox-health"),
        mailboxHealthEmpty: document.getElementById("mailbox-health-empty"),
      };

      function formatDateTime(value) {
        if (!value) {
          return "--";
        }

        return new Intl.DateTimeFormat("zh-CN", {
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }).format(new Date(value));
      }

      function setCopyFeedback(text, tone) {
        elements.copyFeedback.textContent = text;
        elements.copyFeedback.className = "copy-feedback" + (tone ? " " + tone : "");
      }

      function setLoadingState() {
        elements.statusPill.textContent = "Syncing panel...";
        elements.refreshButton.disabled = true;
      }

      function setStateTone(mode) {
        elements.statePanel.className = "panel state-panel " + mode;
      }

      function clearList(element) {
        while (element.firstChild) {
          element.removeChild(element.firstChild);
        }
      }

      function renderList(element, emptyElement, items, renderItem) {
        clearList(element);
        if (!items.length) {
          emptyElement.hidden = false;
          return;
        }

        emptyElement.hidden = true;
        for (const item of items) {
          element.appendChild(renderItem(item));
        }
      }

      function makeStackItem(title, lines) {
        const item = document.createElement("li");
        item.className = "stack-item";

        const strong = document.createElement("strong");
        strong.textContent = title;
        item.appendChild(strong);

        for (const line of lines) {
          const small = document.createElement("small");
          small.textContent = line;
          item.appendChild(small);
        }

        return item;
      }

      function renderPrimarySignal(panel) {
        const primary = panel.primarySignal;

        elements.metricCodes.textContent = String(panel.summary.currentVerificationCodeCount);
        elements.metricMailboxes.textContent = String(panel.summary.mailboxCount);
        elements.metricUnhealthy.textContent = String(panel.summary.unhealthyMailboxCount);
        elements.generatedAt.textContent = "Last sync: " + formatDateTime(panel.generatedAt);

        if (!primary) {
          elements.copyButton.disabled = true;
          elements.metaMailbox.textContent = "--";
          elements.metaReceived.textContent = "--";
          elements.metaSignal.textContent = "--";
          elements.metaCoverage.textContent = "--";

          if (panel.status === "waiting_for_code") {
            elements.heroTitle.textContent = "Waiting for the next code";
            elements.heroNote.textContent = "当前没有新验证码，但链路健康。现在最合理的动作是继续等。";
            elements.codeDisplay.textContent = "WAIT";
            elements.codeCaption.textContent = "Delivery path healthy";
          } else if (panel.status === "delivery_path_unhealthy") {
            elements.heroTitle.textContent = "Delivery path needs attention";
            elements.heroNote.textContent = "这不是普通等待，问题更像在订阅、恢复或认证链路。";
            elements.codeDisplay.textContent = "ALERT";
            elements.codeCaption.textContent = "Recovery or auth issue detected";
          } else {
            elements.heroTitle.textContent = "Panel is empty";
            elements.heroNote.textContent = "系统里还没有可展示的验证码历史。";
            elements.codeDisplay.textContent = "----";
            elements.codeCaption.textContent = "No verification code yet";
          }

          return;
        }

        elements.copyButton.disabled = state.copying;
        elements.heroTitle.textContent = "Latest verification code";
        elements.heroNote.textContent = "主卡直接显示可信信息，复制动作在卡内闭环完成。";
        elements.codeDisplay.textContent = primary.value;
        elements.codeCaption.textContent = primary.acrossMailboxCount > 1
          ? "Across " + primary.acrossMailboxCount + " mailboxes"
          : "Single mailbox source";
        elements.metaMailbox.textContent = primary.mailboxEmailAddress || primary.mailboxId;
        elements.metaReceived.textContent = formatDateTime(primary.receivedAt);
        elements.metaSignal.textContent = primary.signalType;
        elements.metaCoverage.textContent = primary.acrossMailboxCount > 1
          ? "Current latest code across " + primary.acrossMailboxCount + " mailboxes"
          : "Current latest code";
      }

      function renderState(panel) {
        if (panel.status === "ready") {
          setStateTone("is-ready");
          elements.stateBadge.textContent = "Ready to copy";
          elements.stateTitle.textContent = "Primary path is clear";
          elements.stateDescription.textContent = panel.summary.unhealthyMailboxCount > 0
            ? "最新验证码已经可复制，但仍有部分 mailbox 异常。主任务可继续完成，异常不被隐藏。"
            : "最新验证码已经可复制，首页现在就是一个干净的 scan-and-copy 工具。";
          return;
        }

        if (panel.status === "waiting_for_code") {
          setStateTone("is-waiting");
          elements.stateBadge.textContent = "Waiting";
          elements.stateTitle.textContent = "No new code yet";
          elements.stateDescription.textContent = "链路健康，但当前没有新的 verification code。这个状态应该安静，而不是吓人。";
          return;
        }

        if (panel.status === "delivery_path_unhealthy") {
          setStateTone("is-alert");
          elements.stateBadge.textContent = "Path unhealthy";
          elements.stateTitle.textContent = "This is not just waiting";
          elements.stateDescription.textContent = "当前没有验证码，而且至少一个 mailbox 处于 delayed、recovery、reauth 或其他异常状态。";
          return;
        }

        setStateTone("is-empty");
        elements.stateBadge.textContent = "Empty";
        elements.stateTitle.textContent = "Nothing stored yet";
        elements.stateDescription.textContent = "系统还没有 mailbox 或可展示历史。面板会在有数据后自动变成可操作状态。";
      }

      function renderLists(panel) {
        renderList(
          elements.recentCodes,
          elements.recentCodesEmpty,
          panel.recentCodes,
          (entry) => makeStackItem(entry.value, [
            (entry.mailboxEmailAddress || entry.mailboxId) + " / " + formatDateTime(entry.receivedAt),
            "Signal: " + entry.signalType,
          ]),
        );

        renderList(
          elements.secondarySignals,
          elements.secondarySignalsEmpty,
          panel.secondarySignals,
          (entry) => makeStackItem(entry.value, [
            entry.signalType + " / " + (entry.mailboxEmailAddress || entry.mailboxId),
            "Seen at " + formatDateTime(entry.receivedAt),
          ]),
        );

        renderList(
          elements.mailboxHealth,
          elements.mailboxHealthEmpty,
          panel.mailboxes,
          (entry) => makeStackItem(
            entry.emailAddress,
            [
              "State: " + (entry.lifecycleState || "missing_snapshot"),
              entry.recentErrorSummary ? "Note: " + entry.recentErrorSummary : entry.healthy
                ? "Path looks healthy"
                : "Needs inspection",
            ],
          ),
        );
      }

      function renderPanel(panel) {
        state.panel = panel;
        elements.statusPill.textContent = panel.status.replaceAll("_", " ");
        elements.refreshButton.disabled = false;
        renderPrimarySignal(panel);
        renderState(panel);
        renderLists(panel);
      }

      async function copyLatestCode() {
        const primary = state.panel && state.panel.primarySignal;
        if (!primary || state.copying) {
          return;
        }

        state.copying = true;
        elements.copyButton.disabled = true;
        elements.copyButton.textContent = "Copying...";

        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(primary.value);
          } else {
            const textarea = document.createElement("textarea");
            textarea.value = primary.value;
            textarea.setAttribute("readonly", "true");
            textarea.style.position = "absolute";
            textarea.style.left = "-9999px";
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand("copy");
            document.body.removeChild(textarea);
          }

          setCopyFeedback("已复制", "success");
          elements.copyButton.textContent = "Copied";
        } catch (error) {
          setCopyFeedback("复制失败，请重试", "error");
          elements.copyButton.textContent = "Copy failed";
        } finally {
          state.copying = false;
          window.setTimeout(() => {
            const activePrimary = state.panel && state.panel.primarySignal;
            elements.copyButton.disabled = !activePrimary;
            elements.copyButton.textContent = "Copy latest code";
          }, 900);
        }
      }

      async function loadPanel() {
        setLoadingState();

        try {
          const response = await fetch("/api/otp-panel", {
            headers: {
              accept: "application/json",
            },
          });

          if (!response.ok) {
            throw new Error("otp_panel_fetch_failed:" + response.status);
          }

          const panel = await response.json();
          renderPanel(panel);
          setCopyFeedback("", "");
        } catch (error) {
          elements.refreshButton.disabled = false;
          elements.statusPill.textContent = "panel fetch failed";
          setStateTone("is-error");
          elements.stateBadge.textContent = "Read error";
          elements.stateTitle.textContent = "Could not load panel";
          elements.stateDescription.textContent = "首页读接口加载失败。先修这个，再谈复制体验。";
          elements.generatedAt.textContent = "Last sync: failed";
          elements.copyButton.disabled = true;
          elements.codeDisplay.textContent = "ERROR";
          elements.codeCaption.textContent = "Could not reach /api/otp-panel";
          setCopyFeedback("接口读取失败", "error");
        }
      }

      elements.refreshButton.addEventListener("click", () => {
        loadPanel();
      });
      elements.copyButton.addEventListener("click", () => {
        copyLatestCode();
      });

      loadPanel();
      state.refreshTimer = window.setInterval(loadPanel, 15000);
    </script>
  </body>
</html>`;
}
