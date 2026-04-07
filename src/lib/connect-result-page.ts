function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderConnectResultPage(input: {
  title: string;
  headline: string;
  description: string;
  detail?: string | null;
  continueHref?: string | null;
}): string {
  const continueMarkup = input.continueHref
    ? `<p><a href="${escapeHtml(input.continueHref)}">继续</a></p>`
    : "";
  const detailMarkup = input.detail
    ? `<pre>${escapeHtml(input.detail)}</pre>`
    : "";

  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(input.title)}</title>
    <style>
      :root {
        color-scheme: light;
        font-family: "Helvetica Neue", "PingFang SC", sans-serif;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: linear-gradient(135deg, #f4f6fb 0%, #ffffff 100%);
        color: #152033;
      }
      main {
        width: min(560px, calc(100vw - 32px));
        padding: 32px;
        border-radius: 20px;
        background: #ffffff;
        box-shadow: 0 18px 48px rgba(21, 32, 51, 0.12);
      }
      h1 {
        margin: 0 0 12px;
        font-size: 30px;
      }
      p {
        margin: 0 0 14px;
        line-height: 1.6;
      }
      pre {
        overflow-x: auto;
        padding: 12px;
        border-radius: 12px;
        background: #f6f8fc;
        color: #29374d;
        white-space: pre-wrap;
      }
      a {
        color: #0f62fe;
        font-weight: 600;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(input.headline)}</h1>
      <p>${escapeHtml(input.description)}</p>
      ${detailMarkup}
      ${continueMarkup}
    </main>
  </body>
</html>`;
}
