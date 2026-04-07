function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderConnectLauncherPage(input: {
  initialAssetId?: string | null;
} = {}): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Outlook 授权发起</title>
    <style>
      :root {
        color-scheme: light;
        font-family: Inter, "Helvetica Neue", "PingFang SC", sans-serif;
        --bg: #f4f7fb;
        --ink: #142033;
        --ink-soft: #5b6b82;
        --line: #d7dfeb;
        --accent: #125cff;
        --accent-soft: rgba(18, 92, 255, 0.1);
        --card: rgba(255, 255, 255, 0.92);
        --danger: #b42318;
        --danger-soft: rgba(180, 35, 24, 0.08);
        --success: #067647;
      }

      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        background:
          radial-gradient(circle at top left, rgba(18, 92, 255, 0.12), transparent 24%),
          linear-gradient(180deg, #f7faff 0%, var(--bg) 100%);
        color: var(--ink);
      }

      .shell {
        width: min(980px, calc(100vw - 32px));
        margin: 0 auto;
        padding: 32px 0 48px;
      }

      .masthead {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        align-items: flex-start;
        margin-bottom: 24px;
      }

      .eyebrow {
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.14em;
        color: var(--ink-soft);
        margin-bottom: 8px;
      }

      h1 {
        margin: 0 0 10px;
        font-size: clamp(2rem, 5vw, 3.3rem);
        line-height: 0.95;
      }

      .subhead {
        margin: 0;
        max-width: 52rem;
        line-height: 1.65;
        color: var(--ink-soft);
      }

      .nav {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
      }

      .nav a,
      button,
      input {
        font: inherit;
      }

      .nav a,
      .button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 44px;
        padding: 0 16px;
        border-radius: 999px;
        border: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.72);
        color: var(--ink);
        text-decoration: none;
        cursor: pointer;
        transition: transform 140ms ease, border-color 140ms ease, background-color 140ms ease;
      }

      .button:hover,
      .nav a:hover {
        transform: translateY(-1px);
        border-color: rgba(18, 92, 255, 0.36);
      }

      .button-primary {
        background: var(--accent);
        border-color: var(--accent);
        color: #fff;
      }

      .board {
        display: grid;
        grid-template-columns: minmax(0, 1.45fr) minmax(300px, 0.9fr);
        gap: 18px;
      }

      .card {
        border: 1px solid rgba(20, 32, 51, 0.08);
        border-radius: 24px;
        background: var(--card);
        box-shadow: 0 22px 44px rgba(20, 32, 51, 0.08);
        padding: 24px;
      }

      .card h2 {
        margin: 0 0 8px;
        font-size: 1.15rem;
      }

      .card p {
        margin: 0;
        color: var(--ink-soft);
        line-height: 1.6;
      }

      .stack {
        display: grid;
        gap: 16px;
      }

      .field {
        display: grid;
        gap: 8px;
      }

      .field label {
        font-size: 0.94rem;
        font-weight: 600;
      }

      .field input {
        width: 100%;
        min-height: 52px;
        padding: 0 16px;
        border-radius: 16px;
        border: 1px solid var(--line);
        background: #fff;
      }

      .hint {
        font-size: 0.88rem;
        color: var(--ink-soft);
      }

      .intent-shell {
        border-radius: 18px;
        background: #fff;
        border: 1px solid var(--line);
        padding: 18px;
      }

      .intent-shell[data-state="empty"] {
        background: linear-gradient(180deg, #fbfcfe 0%, #f6f8fb 100%);
      }

      .meta-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
        margin-top: 16px;
      }

      .meta-item {
        padding: 12px 14px;
        border-radius: 16px;
        background: #f8faff;
        border: 1px solid #e4ebf6;
      }

      .meta-item strong,
      .meta-item span {
        display: block;
      }

      .meta-item strong {
        font-size: 0.78rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--ink-soft);
        margin-bottom: 6px;
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 16px;
      }

      .status {
        min-height: 24px;
        color: var(--ink-soft);
        font-size: 0.92rem;
      }

      .status[data-tone="error"] {
        color: var(--danger);
      }

      .status[data-tone="success"] {
        color: var(--success);
      }

      .error-box {
        border-radius: 16px;
        border: 1px solid rgba(180, 35, 24, 0.16);
        background: var(--danger-soft);
        padding: 14px 16px;
      }

      .sidebar-list {
        display: grid;
        gap: 14px;
      }

      .sidebar-item {
        border-radius: 18px;
        border: 1px solid var(--line);
        padding: 16px;
        background: #fff;
      }

      .sidebar-item strong {
        display: block;
        margin-bottom: 8px;
      }

      code {
        font-family: "SFMono-Regular", Consolas, monospace;
        font-size: 0.92em;
      }

      @media (max-width: 840px) {
        .masthead,
        .board {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <header class="masthead">
        <div>
          <div class="eyebrow">Outlook Mailbox / OAuth Launcher</div>
          <h1>Outlook 授权发起</h1>
          <p class="subhead">
            这里只做一件事，给单个目标资产生成并发起 Outlook OAuth。它不是排障后台，
            也不是批量工作台。先把当前这一次授权发起稳稳做对。
          </p>
        </div>
        <nav class="nav">
          <a href="/">返回 OTP 面板</a>
        </nav>
      </header>

      <main class="board">
        <section class="card stack">
          <div>
            <h2>当前动作</h2>
            <p>这里直接生成一条通用 Outlook OAuth 发起链接，不预绑定邮箱。谁在浏览器里完成登录，系统就接管谁。</p>
          </div>

          <form id="launcher-form" class="stack">
            <div class="actions">
              <button class="button button-primary" id="generate-button" type="submit">生成授权链接</button>
              <button class="button" id="regenerate-button" type="button">重新生成</button>
            </div>
          </form>

          <div class="status" id="status-text" aria-live="polite"></div>

          <section class="intent-shell" id="intent-shell" data-state="empty">
            <h2 id="intent-title">还没有当前 intent</h2>
            <p id="intent-note">点击生成后拿到 launch link，就可以放进指纹浏览器里跑真实 Outlook 登录。</p>

            <div class="meta-grid">
              <div class="meta-item">
                <strong>Intent</strong>
                <span id="intent-id">--</span>
              </div>
              <div class="meta-item">
                <strong>Status</strong>
                <span id="intent-status">--</span>
              </div>
              <div class="meta-item">
                <strong>Expires</strong>
                <span id="intent-expiry">--</span>
              </div>
              <div class="meta-item">
                <strong>Result</strong>
                <span id="intent-result">--</span>
              </div>
            </div>

            <div class="actions">
              <button class="button button-primary" id="open-button" type="button" disabled>打开授权</button>
              <button class="button" id="copy-link-button" type="button" disabled>复制 launch link</button>
              <button class="button" id="copy-api-button" type="button" disabled>复制 API request</button>
              <a class="button" id="result-link" href="#" hidden>查看结果页</a>
            </div>
          </section>
        </section>

        <aside class="card sidebar-list">
          <div class="sidebar-item">
            <strong>默认行为</strong>
            <p>OAuth 默认在新标签打开。默认回跳当前 launcher page，方便同事连续发起下一次授权。</p>
          </div>
          <div class="sidebar-item">
            <strong>当前页只做发起</strong>
            <p>不在前端预校验邮箱身份，也不在这里做批量编排。邮箱匹配、异常分类、批量调度继续交给脚本和 API。</p>
          </div>
          <div class="sidebar-item error-box">
            <strong>失败时的预期</strong>
            <p>结果页应该告诉操作同事：出了什么问题、最可能的原因、下一步该怎么做。</p>
          </div>
        </aside>
      </main>
    </div>

    <script>
      const elements = {
        form: document.getElementById("launcher-form"),
        statusText: document.getElementById("status-text"),
        shell: document.getElementById("intent-shell"),
        title: document.getElementById("intent-title"),
        note: document.getElementById("intent-note"),
        intentId: document.getElementById("intent-id"),
        intentStatus: document.getElementById("intent-status"),
        intentExpiry: document.getElementById("intent-expiry"),
        intentResult: document.getElementById("intent-result"),
        openButton: document.getElementById("open-button"),
        copyLinkButton: document.getElementById("copy-link-button"),
        copyApiButton: document.getElementById("copy-api-button"),
        generateButton: document.getElementById("generate-button"),
        regenerateButton: document.getElementById("regenerate-button"),
        resultLink: document.getElementById("result-link"),
      };

      let currentIntent = null;

      function setStatus(message, tone) {
        elements.statusText.textContent = message || "";
        elements.statusText.dataset.tone = tone || "";
      }

      function formatDate(value) {
        if (!value) return "--";
        try {
          return new Date(value).toLocaleString("zh-CN", { hour12: false });
        } catch {
          return value;
        }
      }

      function buildApiRequest() {
        return "curl -X POST \\"" + window.location.origin + "/api/mailboxes/connect-intents\\" \\\\\\n" +
          "  -u \\"operator:<PHASE0_OPERATOR_PASSWORD>\\" \\\\\\n" +
          "  -H \\"content-type: application/json\\" \\\\\\n" +
          "  -d '{}'";
      }

      function buildSafeUrl(path) {
        return new URL(path, window.location.origin).toString();
      }

      function renderIntent(intent) {
        currentIntent = intent;

        if (!intent) {
          elements.shell.dataset.state = "empty";
          elements.title.textContent = "还没有当前 intent";
          elements.note.textContent = "点击生成后拿到 launch link，就可以放进指纹浏览器里跑真实 Outlook 登录。";
          elements.intentId.textContent = "--";
          elements.intentStatus.textContent = "--";
          elements.intentExpiry.textContent = "--";
          elements.intentResult.textContent = "--";
          elements.openButton.disabled = true;
          elements.copyLinkButton.disabled = true;
          elements.copyApiButton.disabled = true;
          elements.resultLink.hidden = true;
          return;
        }

        elements.shell.dataset.state = intent.status;
        elements.title.textContent = intent.reused ? "已恢复当前 intent" : "授权链接已就绪";
        elements.note.textContent = "把这条 launch link 发给同事，或者直接放进指纹浏览器里打开即可。";
        elements.intentId.textContent = intent.intentId;
        elements.intentStatus.textContent = intent.status;
        elements.intentExpiry.textContent = formatDate(intent.expiresAt);
        elements.intentResult.textContent = intent.resultUrl || "--";
        elements.openButton.disabled = !intent.startUrl;
        elements.copyLinkButton.disabled = !intent.startUrl;
        elements.copyApiButton.disabled = false;
        elements.resultLink.hidden = !intent.resultUrl;
        elements.resultLink.href = intent.resultUrl || "#";
      }

      async function copyText(value, successMessage) {
        if (!value) return;

        try {
          await navigator.clipboard.writeText(value);
          setStatus(successMessage, "success");
        } catch (error) {
          setStatus("复制失败，请手动复制。", "error");
        }
      }

      async function createIntent(supersedeCurrent) {
        setStatus(supersedeCurrent ? "正在重新生成授权链接..." : "正在生成授权链接...", "");

        try {
          const response = await fetch(buildSafeUrl("/api/mailboxes/connect-intents"), {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "accept": "application/json",
            },
            body: JSON.stringify(supersedeCurrent ? { supersedeCurrent: true } : {}),
          });

          const payload = await response.json().catch(() => ({}));

          if (!response.ok) {
            renderIntent(null);
            setStatus(payload.message || "创建 connect intent 失败。", "error");
            return;
          }

          renderIntent(payload);
          setStatus(payload.reused ? "已复用当前未过期 intent。" : "新的授权链接已生成。", "success");
        } catch (error) {
          renderIntent(null);
          setStatus("浏览器发起请求失败。请刷新页面后重试。", "error");
        }
      }

      elements.form.addEventListener("submit", async (event) => {
        event.preventDefault();
        await createIntent(false);
      });

      elements.regenerateButton.addEventListener("click", async () => {
        await createIntent(true);
      });

      elements.openButton.addEventListener("click", () => {
        if (!currentIntent?.startUrl) return;
        window.open(currentIntent.startUrl, "_blank", "noopener,noreferrer");
      });

      elements.copyLinkButton.addEventListener("click", async () => {
        await copyText(currentIntent?.startUrl || "", "launch link 已复制。");
      });

      elements.copyApiButton.addEventListener("click", async () => {
        await copyText(buildApiRequest(), "API request 已复制。");
      });

      renderIntent(null);
    </script>
  </body>
</html>`;
}
