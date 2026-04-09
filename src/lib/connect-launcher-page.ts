import { baseStyles, JS_THEME_TOGGLE } from "./shared-styles";
import { escapeHtml, clientUtilScripts } from "./shared-scripts";

function pageStyles(): string {
  return `
    .board {
      display: grid;
      grid-template-columns: 1fr 320px;
      gap: 20px;
      align-items: start;
    }

    .main-stack { display: grid; gap: 16px; }

    .intent-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 24px;
      backdrop-filter: blur(20px);
    }

    .intent-card[data-state="pending"] {
      border-color: var(--border-accent);
    }

    .intent-card h2 {
      margin: 0 0 8px;
      font-size: 1rem;
      font-weight: 600;
    }

    .intent-card p {
      margin: 0 0 16px;
      color: var(--text-secondary);
      font-size: 0.88rem;
      line-height: 1.6;
    }

    /* sidebar cards */
    .tip-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 18px;
      backdrop-filter: blur(20px);
    }

    .tip-card strong {
      display: block;
      font-size: 0.88rem;
      margin-bottom: 8px;
    }

    .tip-card p {
      margin: 0;
      font-size: 0.82rem;
      color: var(--text-secondary);
      line-height: 1.55;
    }

    .tip-card.is-warning {
      border-color: var(--danger);
      border-color: color-mix(in srgb, var(--danger) 20%, transparent);
    }

    .tip-card.is-warning strong {
      color: var(--danger);
    }

    .sidebar-stack { display: grid; gap: 12px; }

    @media (max-width: 820px) {
      .board { grid-template-columns: 1fr; }
    }
  `;
}

export function renderConnectLauncherPage(input: {
  initialAssetId?: string | null;
} = {}): string {
  return `<!DOCTYPE html>
<html lang="zh-CN" data-theme="light">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Outlook 授权发起</title>
    <script>${JS_THEME_TOGGLE}<\/script>
    <style>${baseStyles()}${pageStyles()}</style>
  </head>
  <body>
    <div class="shell">
      <nav class="app-header">
        <div class="app-branding">
          <span class="brand-title">OAuth Launcher</span>
        </div>
        
        <div class="app-actions">
          <a class="nav-link" href="/">← OTP Panel</a>
          <button class="theme-toggle" id="theme-toggle" type="button" onclick="__toggleTheme()" title="切换主题">☀</button>
        </div>
      </nav>

      <main class="board">
        <section class="main-stack">
          <div class="card animate-in">
            <div class="card-header">
              <span class="card-title">Action</span>
              <h2>生成 Outlook OAuth 授权链接</h2>
            </div>
            <p>生成一条通用授权链接，不预绑定邮箱。谁在浏览器里完成登录，系统就接管谁。</p>
            <form id="launcher-form">
              <div class="btn-group">
                <button class="btn btn-primary" id="generate-button" type="submit">生成授权链接</button>
                <button class="btn" id="regenerate-button" type="button">重新生成</button>
              </div>
            </form>
            <div class="feedback" id="status-text" style="margin-top:12px" aria-live="polite"></div>
          </div>

          <div class="intent-card animate-in delay-1" id="intent-shell" data-state="empty">
            <div class="card-header">
              <span class="card-title">Intent</span>
              <h2 id="intent-title">还没有当前 intent</h2>
            </div>
            <p id="intent-note">点击生成后拿到 launch link，放进指纹浏览器里跑真实 Outlook 登录。</p>

            <div class="meta-grid">
              <div class="meta-cell meta-cell--full">
                <span class="meta-label">Intent ID</span>
                <span class="meta-value" id="intent-id">--</span>
              </div>
              <div class="meta-cell meta-cell--full">
                <span class="meta-label">Status</span>
                <span class="meta-value" id="intent-status">--</span>
              </div>
              <div class="meta-cell meta-cell--full">
                <span class="meta-label">Expires</span>
                <span class="meta-value" id="intent-expiry">--</span>
              </div>
              <div class="meta-cell meta-cell--full">
                <span class="meta-label">Result</span>
                <span class="meta-value" id="intent-result">--</span>
              </div>
            </div>

            <div class="btn-group" style="margin-top:16px">
              <button class="btn btn-primary" id="open-button" type="button" disabled>打开授权</button>
              <button class="btn" id="copy-link-button" type="button" disabled>复制 launch link</button>
              <button class="btn" id="copy-api-button" type="button" disabled>复制 API request</button>
              <a class="btn" id="result-link" href="#" hidden>查看结果页</a>
            </div>
          </div>
        </section>

        <aside class="sidebar-stack">
          <div class="tip-card animate-in delay-2">
            <strong>默认行为</strong>
            <p>OAuth 默认在新标签打开。回跳当前 launcher page，方便连续发起下一次授权。</p>
          </div>
          <div class="tip-card animate-in delay-3">
            <strong>当前页只做发起</strong>
            <p>不在前端预校验邮箱身份。邮箱匹配、异常分类、批量调度交给脚本和 API。</p>
          </div>
          <div class="tip-card is-warning animate-in delay-4">
            <strong>失败时的预期</strong>
            <p>结果页应告诉操作者：出了什么问题、最可能的原因、下一步该怎么做。</p>
          </div>
        </aside>
      </main>
    </div>

    <script>
      ${clientUtilScripts()}

      var el = {
        form: document.getElementById("launcher-form"),
        statusText: document.getElementById("status-text"),
        shell: document.getElementById("intent-shell"),
        title: document.getElementById("intent-title"),
        note: document.getElementById("intent-note"),
        intentId: document.getElementById("intent-id"),
        intentStatus: document.getElementById("intent-status"),
        intentExpiry: document.getElementById("intent-expiry"),
        intentResult: document.getElementById("intent-result"),
        openBtn: document.getElementById("open-button"),
        copyLinkBtn: document.getElementById("copy-link-button"),
        copyApiBtn: document.getElementById("copy-api-button"),
        genBtn: document.getElementById("generate-button"),
        regenBtn: document.getElementById("regenerate-button"),
        resultLink: document.getElementById("result-link"),
      };

      var currentIntent = null;

      function setStatus(msg, tone) {
        el.statusText.textContent = msg || "";
        el.statusText.dataset.tone = tone || "";
      }

      function buildApiReq() {
        return "curl -X POST \\"" + location.origin + "/api/mailboxes/connect-intents\\" \\\\\\n  -u \\"world:<PASSWORD>\\" \\\\\\n  -H \\"content-type: application/json\\" \\\\\\n  -d '{}'";
      }

      function renderIntent(intent) {
        currentIntent = intent;
        if (!intent) {
          el.shell.dataset.state = "empty";
          el.title.textContent = "还没有当前 intent";
          el.note.textContent = "点击生成后拿到 launch link，放进指纹浏览器里跑真实 Outlook 登录。";
          el.intentId.textContent = "--";
          el.intentStatus.textContent = "--";
          el.intentExpiry.textContent = "--";
          el.intentResult.textContent = "--";
          el.openBtn.disabled = true;
          el.copyLinkBtn.disabled = true;
          el.copyApiBtn.disabled = true;
          el.resultLink.hidden = true;
          return;
        }
        el.shell.dataset.state = intent.status;
        el.title.textContent = intent.reused ? "已恢复当前 intent" : "授权链接已就绪";
        el.note.textContent = "把链接发给同事或放进指纹浏览器打开。";
        el.intentId.textContent = intent.intentId;
        el.intentStatus.textContent = intent.status;
        el.intentExpiry.textContent = formatFullDateTime(intent.expiresAt);
        el.intentResult.textContent = intent.resultUrl || "--";
        el.openBtn.disabled = !intent.startUrl;
        el.copyLinkBtn.disabled = !intent.startUrl;
        el.copyApiBtn.disabled = false;
        el.resultLink.hidden = !intent.resultUrl;
        el.resultLink.href = intent.resultUrl || "#";
      }

      async function createIntent(supersede) {
        setStatus(supersede ? "正在重新生成..." : "正在生成...", "");
        try {
          var r = await fetch(location.origin + "/api/mailboxes/connect-intents", {
            method: "POST",
            headers: { "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify(supersede ? { supersedeCurrent: true } : {}),
          });
          var data = await r.json().catch(function() { return {}; });
          if (!r.ok) { renderIntent(null); setStatus(data.message || "创建失败", "error"); return; }
          renderIntent(data);
          setStatus(data.reused ? "已复用当前未过期 intent" : "新授权链接已生成", "success");
        } catch (e) {
          renderIntent(null);
          setStatus("请求失败，请刷新页面", "error");
        }
      }

      el.form.addEventListener("submit", function(e) { e.preventDefault(); createIntent(false); });
      el.regenBtn.addEventListener("click", function() { createIntent(true); });
      el.openBtn.addEventListener("click", function() {
        if (currentIntent && currentIntent.startUrl) window.open(currentIntent.startUrl, "_blank", "noopener");
      });
      el.copyLinkBtn.addEventListener("click", function() {
        copyText(currentIntent && currentIntent.startUrl || "",
          function() { setStatus("launch link 已复制", "success"); },
          function() { setStatus("复制失败", "error"); }
        );
      });
      el.copyApiBtn.addEventListener("click", function() {
        copyText(buildApiReq(),
          function() { setStatus("API request 已复制", "success"); },
          function() { setStatus("复制失败", "error"); }
        );
      });

      renderIntent(null);
    </script>
  </body>
</html>`;
}
