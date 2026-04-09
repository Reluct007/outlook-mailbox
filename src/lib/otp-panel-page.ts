import { baseStyles, JS_THEME_TOGGLE } from "./shared-styles";
import { clientUtilScripts } from "./shared-scripts";

function pageStyles(): string {
  return `
    .board {
      display: grid;
      grid-template-columns: 1fr 340px;
      gap: 20px;
      align-items: start;
    }

    /* --- hero --- */
    .hero { display: grid; gap: 20px; }

    .code-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 28px;
      backdrop-filter: blur(20px);
      position: relative;
      overflow: hidden;
    }

    .code-card::before {
      content: "";
      position: absolute;
      inset: -1px;
      border-radius: var(--radius);
      padding: 1px;
      background: linear-gradient(135deg, rgba(0,212,170,0.2), transparent 50%, rgba(0,212,170,0.05));
      -webkit-mask: linear-gradient(#fff 0,#fff 0) content-box, linear-gradient(#fff 0,#fff 0);
      -webkit-mask-composite: xor;
      mask-composite: exclude;
      pointer-events: none;
    }

    .code-display-area {
      background: var(--bg-input);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      min-height: 160px;
      display: grid;
      place-items: center;
      padding: 24px;
      text-align: center;
      position: relative;
      overflow: hidden;
      margin-bottom: 20px;
    }

    .code-display-area::after {
      content: "";
      position: absolute;
      inset: 0;
      background: radial-gradient(ellipse at center, rgba(0,212,170,0.03) 0%, transparent 70%);
      pointer-events: none;
    }



    .code-value {
      font-family: "JetBrains Mono", monospace;
      font-size: clamp(2.8rem, 7vw, 5rem);
      font-weight: 800;
      letter-spacing: 0.14em;
      text-indent: 0.14em;
      line-height: 1;
      color: var(--text);
      position: relative;
      z-index: 1;
    }

    .code-caption {
      display: block;
      margin-top: 10px;
      font-size: 0.72rem;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-tertiary);
      position: relative;
      z-index: 1;
    }

    /* skeleton */
    .code-skel-wrap { display: grid; gap: 10px; place-items: center; }
    .code-skel-bar { width: 65%; height: 48px; border-radius: 8px; }
    .code-skel-line { width: 35%; height: 12px; border-radius: 6px; }

    .copy-row {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 12px;
      align-items: center;
      margin-bottom: 16px;
    }

    .copy-btn {
      appearance: none;
      border: none;
      width: 100%;
      min-height: 52px;
      border-radius: var(--radius-sm);
      background: var(--accent);
      color: var(--accent-text);
      font-family: "JetBrains Mono", monospace;
      font-size: 0.9rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      cursor: pointer;
      transition: all var(--dur) ease;
      box-shadow: 0 0 24px var(--accent-dim);
    }

    .copy-btn:hover:not(:disabled) {
      background: var(--accent-hover);
      box-shadow: 0 0 32px var(--accent-dim);
      transform: translateY(-1px);
    }

    .copy-btn:active:not(:disabled) {
      transform: translateY(0) scale(0.99);
    }

    .copy-btn:disabled {
      opacity: 0.35;
      cursor: not-allowed;
    }

    .copy-btn.is-success {
      background: var(--success);
      color: #fff;
      box-shadow: 0 0 20px var(--success-dim);
    }

    .copy-btn.is-error {
      background: var(--danger);
      color: #fff;
      box-shadow: 0 0 20px var(--danger-dim);
    }

    .copy-feedback {
      font-size: 0.78rem;
      color: var(--text-tertiary);
      text-align: right;
      white-space: nowrap;
    }

    .copy-feedback.success { color: var(--success); }
    .copy-feedback.error { color: var(--danger); }

    /* summary */
    .summary-row {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1px;
      background: var(--border);
      border-radius: var(--radius-sm);
      overflow: hidden;
    }

    .summary-cell {
      background: var(--bg-surface);
      padding: 14px 16px;
    }

    .summary-label {
      display: block;
      font-size: 0.68rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-tertiary);
      margin-bottom: 6px;
    }

    .summary-value {
      font-family: "JetBrains Mono", monospace;
      font-size: 1.3rem;
      font-weight: 700;
      color: var(--text);
    }

    /* --- sidebar --- */
    .sidebar { display: grid; gap: 16px; }

    .state-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 20px;
      backdrop-filter: blur(20px);
    }

    .state-card.is-ready { border-color: rgba(52,211,153,0.2); }
    .state-card.is-waiting { border-color: rgba(251,191,36,0.2); }
    .state-card.is-alert, .state-card.is-error { border-color: rgba(248,113,113,0.2); }

    .state-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 10px;
    }

    .state-indicator {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--text-tertiary);
      flex-shrink: 0;
    }

    .state-card.is-ready .state-indicator { background: var(--success); box-shadow: 0 0 10px var(--success); }
    .state-card.is-waiting .state-indicator { background: var(--warning); box-shadow: 0 0 10px var(--warning); }
    .state-card.is-alert .state-indicator, .state-card.is-error .state-indicator { background: var(--danger); box-shadow: 0 0 10px var(--danger); }

    .state-label {
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--text);
    }

    .state-title {
      margin: 0 0 6px;
      font-size: 1rem;
      font-weight: 600;
    }

    .state-desc {
      margin: 0;
      font-size: 0.82rem;
      color: var(--text-secondary);
      line-height: 1.55;
    }

    .state-sync {
      margin-top: 12px;
      font-size: 0.72rem;
      color: var(--text-tertiary);
    }

    .sidebar-section {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 18px;
      backdrop-filter: blur(20px);
    }

    /* mobile */
    @media (max-width: 900px) {
      .board { grid-template-columns: 1fr; }
    }

    @media (max-width: 768px) {
      .code-value { font-size: clamp(2rem, 12vw, 3.5rem); }
      .code-display-area { min-height: 120px; padding: 18px; }
      .code-card { padding: 20px; }
      .copy-row { grid-template-columns: 1fr; }
      .copy-feedback { text-align: left; }
      .summary-row { grid-template-columns: 1fr 1fr 1fr; }
    }
  `;
}

export function renderOtpPanelPage(): string {
  return `<!doctype html>
<html lang="zh-CN" data-theme="light">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>OTP Panel</title>
    <script>${JS_THEME_TOGGLE}<\/script>
    <style>${baseStyles()}${pageStyles()}</style>
  </head>
  <body>
    <div class="sync-bar" id="sync-bar" style="width:0%"></div>

    <div class="shell">
      <nav class="app-header">
        <div class="app-branding">
          <span class="brand-title">Mailbox</span>
          <div class="status-dot" id="status-pill">syncing</div>
        </div>
        
        <div class="mode-switcher">
          <button class="mode-tab active" data-view="otp" id="tab-otp">
            <span class="tab-icon">⏺</span>验证码
          </button>
          <button class="mode-tab" data-view="explorer" id="tab-explorer">
            <span class="tab-icon">🔍</span>邮件溯源
          </button>
        </div>

        <div class="app-actions">
          <a class="nav-link" href="/connect/outlook">OAuth Launcher</a>
          <button class="nav-link" id="refresh-button" type="button">↻ Refresh</button>
          <button class="theme-toggle" id="theme-toggle" type="button" onclick="__toggleTheme()" title="切换主题">☀</button>
        </div>
      </nav>

      <div id="view-otp" class="view-container active">
        <main class="board">
        <section class="hero">
          <div class="code-card animate-in">
            <div class="code-display-area" id="code-window">
              <div id="code-content">
                <div class="code-skel-wrap" id="code-skeleton">
                  <div class="skel code-skel-bar"></div>
                  <div class="skel code-skel-line"></div>
                </div>
                <span class="code-value" id="code-display" style="display:none"></span>
                <span class="code-caption" id="code-caption" style="display:none"></span>
              </div>
            </div>

            <div class="copy-row">
              <button class="copy-btn" id="copy-button" type="button" disabled>Copy Code</button>
              <div class="copy-feedback" id="copy-feedback" aria-live="polite"></div>
            </div>

            <div class="meta-grid">
              <div class="meta-cell">
                <span class="meta-label">Source</span>
                <span class="meta-value" id="meta-mailbox">--</span>
              </div>
              <div class="meta-cell">
                <span class="meta-label">Received</span>
                <span class="meta-value" id="meta-received" title="">--</span>
              </div>
              <div class="meta-cell">
                <span class="meta-label">Signal</span>
                <span class="meta-value" id="meta-signal">--</span>
              </div>
              <div class="meta-cell">
                <span class="meta-label">Coverage</span>
                <span class="meta-value" id="meta-coverage">--</span>
              </div>
            </div>
            
            <div class="main-recent-codes" id="main-recent-codes" style="display: none;"></div>
          </div>

          <div class="summary-row animate-in delay-1">
            <div class="summary-cell">
              <span class="summary-label">Current Codes</span>
              <span class="summary-value" id="metric-codes">0</span>
            </div>
            <div class="summary-cell">
              <span class="summary-label">Mailboxes</span>
              <span class="summary-value" id="metric-mailboxes">0</span>
            </div>
            <div class="summary-cell">
              <span class="summary-label">Unhealthy</span>
              <span class="summary-value" id="metric-unhealthy">0</span>
            </div>
          </div>
        </section>

        <section class="sidebar">
          <div class="state-card animate-in delay-1" id="state-panel">
            <div class="state-header">
              <div class="state-indicator"></div>
              <span class="state-label" id="state-badge">Loading</span>
            </div>
            <h3 class="state-title" id="state-title">Panel is waking up</h3>
            <p class="state-desc" id="state-description">正在读取 /api/otp-panel 数据...</p>
            <div class="state-sync" id="generated-at">Last sync: --</div>
          </div>

          <div class="sidebar-section animate-in delay-2">
            <h4 class="section-title">Recent Codes</h4>
            <ul class="list-group" id="recent-codes"></ul>
            <p class="list-empty" id="recent-codes-empty">暂无历史验证码</p>
          </div>

          <div class="sidebar-section animate-in delay-3">
            <h4 class="section-title">Secondary Signals</h4>
            <ul class="list-group" id="secondary-signals"></ul>
            <p class="list-empty" id="secondary-signals-empty">当前没有次级 signal</p>
          </div>

          <div class="sidebar-section animate-in delay-4">
            <h4 class="section-title">Mailbox Health</h4>
            <ul class="list-group" id="mailbox-health"></ul>
            <p class="list-empty" id="mailbox-health-empty">还没有 mailbox 数据</p>
          </div>
        </section>
        </main>
      </div>

      <div id="view-explorer" class="view-container">
        <div style="padding: 100px 20px; text-align: center; color: var(--text-secondary);">
          <h2 style="font-size: 1.5rem; margin-bottom: 12px;">🔍 邮件溯源模式正在开发中</h2>
          <p>此页面将作为高级调试版：左侧显示时间流邮件列表，右侧安全渲染原始 HTML 正文。</p>
        </div>
      </div>
    </div>

    <script>
      ${clientUtilScripts()}

      var SYNC_MS = 15000, FEEDBACK_MS = 1800;

      var state = { panel: null, copying: false, timer: null, cd: null, elapsed: 0 };

      var el = {
        tabOtp: document.getElementById("tab-otp"),
        tabExplorer: document.getElementById("tab-explorer"),
        viewOtp: document.getElementById("view-otp"),
        viewExplorer: document.getElementById("view-explorer"),
        syncBar: document.getElementById("sync-bar"),
        pill: document.getElementById("status-pill"),
        refresh: document.getElementById("refresh-button"),
        heroTitle: null,
        skel: document.getElementById("code-skeleton"),
        codeVal: document.getElementById("code-display"),
        codeCap: document.getElementById("code-caption"),
        mailbox: document.getElementById("meta-mailbox"),
        received: document.getElementById("meta-received"),
        signal: document.getElementById("meta-signal"),
        coverage: document.getElementById("meta-coverage"),
        codes: document.getElementById("metric-codes"),
        boxes: document.getElementById("metric-mailboxes"),
        sick: document.getElementById("metric-unhealthy"),
        copyBtn: document.getElementById("copy-button"),
        copyFb: document.getElementById("copy-feedback"),
        stateCard: document.getElementById("state-panel"),
        stateBadge: document.getElementById("state-badge"),
        stateTitle: document.getElementById("state-title"),
        stateDesc: document.getElementById("state-description"),
        syncAt: document.getElementById("generated-at"),
        recentList: document.getElementById("recent-codes"),
        recentEmpty: document.getElementById("recent-codes-empty"),
        secList: document.getElementById("secondary-signals"),
        secEmpty: document.getElementById("secondary-signals-empty"),
        healthList: document.getElementById("mailbox-health"),
        healthEmpty: document.getElementById("mailbox-health-empty"),
        mainRecentCodes: document.getElementById("main-recent-codes"),
      };

      function showSkel() {
        el.skel.style.display = "";
        el.codeVal.style.display = "none";
        el.codeCap.style.display = "none";
      }

      function showCode(v, cap) {
        el.skel.style.display = "none";
        el.codeVal.style.display = "";
        el.codeVal.textContent = v;
        el.codeCap.style.display = "";
        el.codeCap.textContent = cap;
      }

      function startCountdown() {
        if (state.cd) clearInterval(state.cd);
        state.elapsed = 0;
        el.syncBar.classList.remove("is-syncing");
        state.cd = setInterval(function() {
          state.elapsed += 200;
          el.syncBar.style.width = Math.min(state.elapsed / SYNC_MS * 100, 100) + "%";
        }, 200);
      }

      function showSyncing() {
        if (state.cd) clearInterval(state.cd);
        el.syncBar.style.width = "100%";
        el.syncBar.classList.add("is-syncing");
      }

      // -- Dual Mode Logic --
      function switchView(mode) {
        if (!el.tabOtp || !el.tabExplorer) return;
        if (mode === "otp") {
          el.tabOtp.classList.add("active");
          el.tabExplorer.classList.remove("active");
          el.viewOtp.classList.add("active");
          el.viewExplorer.classList.remove("active");
        } else {
          el.tabExplorer.classList.add("active");
          el.tabOtp.classList.remove("active");
          el.viewExplorer.classList.add("active");
          el.viewOtp.classList.remove("active");
        }
      }
      
      if (el.tabOtp) el.tabOtp.addEventListener("click", function() { switchView("otp"); });
      if (el.tabExplorer) el.tabExplorer.addEventListener("click", function() { switchView("explorer"); });

      function setFb(t, tone) {
        el.copyFb.textContent = t;
        el.copyFb.className = "copy-feedback" + (tone ? " " + tone : "");
      }

      function setStateTone(mode) {
        el.stateCard.className = "state-card animate-in delay-1 " + mode;
      }

      function pillClass(status) {
        if (status === "ready") return "status-dot is-ready";
        if (status === "waiting_for_code") return "status-dot is-waiting";
        if (status === "delivery_path_unhealthy") return "status-dot is-alert";
        return "status-dot";
      }

      function renderPrimary(p) {
        var s = p.primarySignal;
        el.codes.textContent = p.summary.currentVerificationCodeCount;
        el.boxes.textContent = p.summary.mailboxCount;
        el.sick.textContent = p.summary.unhealthyMailboxCount;
        el.syncAt.textContent = "Last sync: " + formatDateTime(p.generatedAt);

        if (!s) {
          el.copyBtn.disabled = true;
          el.copyBtn.className = "copy-btn";
          el.mailbox.textContent = "--";
          el.received.textContent = "--";
          el.received.title = "";
          el.signal.textContent = "--";
          el.coverage.textContent = "--";
          if (p.status === "waiting_for_code") {
            showCode("WAIT", "Delivery path healthy — no new code yet");
          } else if (p.status === "delivery_path_unhealthy") {
            showCode("ALERT", "Recovery or auth issue detected");
          } else {
            showCode("—", "No verification code yet");
          }
          return;
        }

        el.copyBtn.disabled = state.copying;
        el.copyBtn.className = "copy-btn";
        showCode(s.value, s.acrossMailboxCount > 1 ? "Across " + s.acrossMailboxCount + " mailboxes" : "Single mailbox source");
        el.mailbox.textContent = s.mailboxEmailAddress || s.mailboxId;
        el.received.textContent = formatRelativeTime(s.receivedAt);
        el.received.title = formatFullDateTime(s.receivedAt);
        el.signal.textContent = s.signalType;
        el.coverage.textContent = s.acrossMailboxCount > 1 ? s.acrossMailboxCount + " mailboxes" : "Single source";
        
        var rc = p.recentCodes || [];
        var inlineRc = el.mainRecentCodes;
        if (!inlineRc) return;
        
        if (rc.length === 0) {
          inlineRc.style.display = "none";
          inlineRc.innerHTML = "";
          return;
        }
        
        inlineRc.style.display = "flex";
        inlineRc.innerHTML = "";
        
        var toShow = rc.slice(0, 2);
        for (var i = 0; i < toShow.length; i++) {
          var hs = toShow[i];
          var card = document.createElement('div');
          card.className = "inline-recent-card animate-in delay-" + (i + 1);
          card.setAttribute("title", "Click to copy " + hs.value);
          
          var left = document.createElement('div');
          left.className = "inline-recent-code";
          left.textContent = hs.value;
          
          var right = document.createElement('div');
          right.className = "inline-recent-meta";
          
          var emailInfo = document.createElement('div');
          emailInfo.textContent = hs.mailboxEmailAddress || hs.mailboxId;
          emailInfo.style.fontWeight = "600";
          emailInfo.style.marginBottom = "2px";
          
          var timeInfo = document.createElement('div');
          timeInfo.textContent = formatRelativeTime(hs.receivedAt);
          
          right.appendChild(emailInfo);
          right.appendChild(timeInfo);
          
          card.appendChild(left);
          card.appendChild(right);
          
          (function(codeVal, copyCard) {
            copyCard.addEventListener('click', function() {
              if (state.copying) return;
              var originalColor = copyCard.style.backgroundColor;
              copyCard.style.backgroundColor = "rgba(52, 211, 153, 0.15)";
              state.copying = true;
              copyText(codeVal, function() {
                setFb("已复制 " + codeVal, "success");
                setTimeout(function() { 
                  copyCard.style.backgroundColor = originalColor; 
                  state.copying = false;
                }, FEEDBACK_MS);
              }, function() {
                setFb("复制失败", "error");
                setTimeout(function() { 
                  copyCard.style.backgroundColor = originalColor; 
                  state.copying = false;
                }, FEEDBACK_MS);
              });
            });
          })(hs.value, card);
          
          inlineRc.appendChild(card);
        }
      }

      function renderState(p) {
        if (p.status === "ready") {
          setStateTone("is-ready");
          el.stateBadge.textContent = "Ready";
          el.stateTitle.textContent = "可以复制";
          el.stateDesc.textContent = p.summary.unhealthyMailboxCount > 0
            ? "最新验证码可复制，但仍有部分 mailbox 异常。"
            : "最新验证码已就绪。";
        } else if (p.status === "waiting_for_code") {
          setStateTone("is-waiting");
          el.stateBadge.textContent = "Waiting";
          el.stateTitle.textContent = "等待新验证码";
          el.stateDesc.textContent = "链路健康，当前没有新的 verification code。";
        } else if (p.status === "delivery_path_unhealthy") {
          setStateTone("is-alert");
          el.stateBadge.textContent = "Unhealthy";
          el.stateTitle.textContent = "需要检查";
          el.stateDesc.textContent = "至少一个 mailbox 处于异常状态。";
        } else {
          setStateTone("");
          el.stateBadge.textContent = "Empty";
          el.stateTitle.textContent = "暂无数据";
          el.stateDesc.textContent = "系统还没有 mailbox 或验证码历史。";
        }
      }

      function renderLists(p) {
        renderList(el.recentList, el.recentEmpty, p.recentCodes, function(e) {
          return makeListItem(e.value, (e.mailboxEmailAddress || e.mailboxId) + " · " + formatRelativeTime(e.receivedAt));
        });
        renderList(el.secList, el.secEmpty, p.secondarySignals, function(e) {
          return makeListItem(e.value, e.signalType + " · " + (e.mailboxEmailAddress || e.mailboxId));
        });
        renderList(el.healthList, el.healthEmpty, p.mailboxes, function(e) {
          return makeListItem(e.emailAddress, (e.lifecycleState || "unknown") + (e.healthy ? " ✓" : " ⚠"));
        });
      }

      function renderPanel(p) {
        state.panel = p;
        el.pill.className = pillClass(p.status);
        el.pill.textContent = p.status.replace(/_/g, " ");
        el.refresh.disabled = false;
        renderPrimary(p);
        renderState(p);
        renderLists(p);
        startCountdown();
      }

      function doCopy() {
        var s = state.panel && state.panel.primarySignal;
        if (!s || state.copying) return;
        state.copying = true;
        el.copyBtn.disabled = true;
        el.copyBtn.textContent = "Copying...";
        copyText(s.value,
          function() {
            setFb("已复制", "success");
            el.copyBtn.textContent = "Copied ✓";
            el.copyBtn.className = "copy-btn is-success";
          },
          function() {
            setFb("复制失败", "error");
            el.copyBtn.textContent = "Failed";
            el.copyBtn.className = "copy-btn is-error";
          }
        );
        setTimeout(function() {
          state.copying = false;
          var a = state.panel && state.panel.primarySignal;
          el.copyBtn.disabled = !a;
          el.copyBtn.textContent = "Copy Code";
          el.copyBtn.className = "copy-btn";
        }, FEEDBACK_MS);
      }

      async function loadPanel() {
        showSyncing();
        el.pill.textContent = "syncing";
        el.refresh.disabled = true;
        try {
          var r = await fetch("/api/otp-panel", { headers: { accept: "application/json" } });
          if (!r.ok) throw new Error("fetch_failed:" + r.status);
          renderPanel(await r.json());
          setFb("", "");
        } catch (e) {
          el.refresh.disabled = false;
          el.pill.className = "status-dot is-alert";
          el.pill.textContent = "error";
          setStateTone("is-error");
          el.stateBadge.textContent = "Error";
          el.stateTitle.textContent = "加载失败";
          el.stateDesc.textContent = "无法读取 /api/otp-panel";
          el.syncAt.textContent = "Last sync: failed";
          el.copyBtn.disabled = true;
          showCode("ERR", "Could not reach /api/otp-panel");
          setFb("接口读取失败", "error");
          startCountdown();
        }
      }

      el.refresh.addEventListener("click", loadPanel);
      el.copyBtn.addEventListener("click", doCopy);
      loadPanel();
      state.timer = setInterval(loadPanel, SYNC_MS);
    </script>
  </body>
</html>`;
}
