import { baseStyles, JS_THEME_TOGGLE } from "./shared-styles";
import { escapeHtml } from "./shared-scripts";

function pageStyles(): string {
  return `
    body { display: grid; place-items: center; min-height: 100vh; }

    .page-actions {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 10;
    }

    .result-card {
      width: min(520px, calc(100vw - 32px));
      padding: 36px;
      border-radius: var(--radius);
      background: var(--bg-card);
      border: 1px solid var(--border);
      backdrop-filter: blur(20px);
      position: relative;
      animation: fade-in 0.4s var(--ease) both;
    }

    .result-card.is-success { border-color: rgba(52,211,153,0.2); }
    .result-card.is-failure { border-color: rgba(248,113,113,0.2); }
    .result-card.is-expired { border-color: rgba(251,191,36,0.2); }

    .result-icon {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      margin-bottom: 20px;
      font-size: 1.4rem;
    }

    .is-success .result-icon { background: var(--success-dim); color: var(--success); }
    .is-failure .result-icon { background: var(--danger-dim); color: var(--danger); }
    .is-expired .result-icon { background: var(--warning-dim); color: var(--warning); }
    .is-pending .result-icon { background: rgba(255,255,255,0.06); color: var(--text-secondary); }

    .result-card h1 {
      margin: 0 0 10px;
      font-size: 1.4rem;
      font-weight: 700;
      letter-spacing: -0.02em;
    }

    .result-card p {
      margin: 0 0 16px;
      color: var(--text-secondary);
      font-size: 0.9rem;
      line-height: 1.6;
    }

    .result-detail {
      padding: 14px 16px;
      border-radius: var(--radius-xs);
      background: var(--bg-input);
      border: 1px solid var(--border);
      color: var(--text-secondary);
      overflow-x: auto;
      white-space: pre-wrap;
      font-family: "JetBrains Mono", monospace;
      font-size: 0.8rem;
      line-height: 1.55;
      margin-bottom: 20px;
    }

    @media (max-width: 560px) {
      .result-card { padding: 24px; }
      .btn-group { flex-direction: column; }
    }
  `;
}

function classify(input: { headline: string; title: string }): string {
  const t = input.title.toLowerCase();
  const h = input.headline.toLowerCase();
  if (t.includes("完成") || h.includes("成功") || h.includes("已激活")) return "success";
  if (t.includes("失败") || h.includes("失败")) return "failure";
  if (t.includes("过期") || h.includes("过期")) return "expired";
  return "pending";
}

function iconFor(tone: string): string {
  switch (tone) {
    case "success": return "✓";
    case "failure": return "✕";
    case "expired": return "⏱";
    default: return "…";
  }
}

export function renderConnectResultPage(input: {
  title: string;
  headline: string;
  description: string;
  detail?: string | null;
  continueHref?: string | null;
}): string {
  const tone = classify(input);
  const icon = iconFor(tone);

  const detail = input.detail
    ? `<pre class="result-detail">${escapeHtml(input.detail)}</pre>`
    : "";

  const autoRefresh = tone === "pending"
    ? `<meta http-equiv="refresh" content="3">`
    : "";

  const actions = input.continueHref
    ? `<div class="btn-group">
        <a class="btn btn-primary" href="${escapeHtml(input.continueHref)}">继续</a>
        <a class="btn" href="/">返回 OTP Panel</a>
      </div>`
    : `<div class="btn-group">
        <a class="btn btn-primary" href="/">返回 OTP Panel</a>
      </div>`;

  return `<!DOCTYPE html>
<html lang="zh-CN" data-theme="light">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(input.title)}</title>
    ${autoRefresh}
    <script>${JS_THEME_TOGGLE}<\/script>
    <style>${baseStyles()}${pageStyles()}</style>
  </head>
  <body>
    <div class="page-actions"><button class="theme-toggle" id="theme-toggle" type="button" onclick="__toggleTheme()" title="切换主题">☀</button></div>
    <main class="result-card is-${tone}">
      <div class="result-icon">${icon}</div>
      <h1>${escapeHtml(input.headline)}</h1>
      <p>${escapeHtml(input.description)}</p>
      ${detail}
      ${actions}
    </main>
  </body>
</html>`;
}
