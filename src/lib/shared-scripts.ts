/**
 * Shared frontend utility functions emitted as inline <script> fragments.
 *
 * These are TypeScript functions that return *strings* of JavaScript to be
 * embedded inside template-literal HTML pages. They are not executed on the
 * server — they run in the browser.
 */

// ---------------------------------------------------------------------------
// Server-side HTML escaping (used in template strings)
// ---------------------------------------------------------------------------
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// ---------------------------------------------------------------------------
// Client-side JS: relative time formatting
// ---------------------------------------------------------------------------
export const JS_FORMAT_RELATIVE_TIME = `
  function formatRelativeTime(value) {
    if (!value) return "--";
    var now = Date.now();
    var then = new Date(value).getTime();
    var diffMs = now - then;
    if (diffMs < 0) return "just now";
    var diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return diffSec + " 秒前";
    var diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return diffMin + " 分钟前";
    var diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return diffHour + " 小时前";
    var diffDay = Math.floor(diffHour / 24);
    return diffDay + " 天前";
  }
`;

// ---------------------------------------------------------------------------
// Client-side JS: date/time formatting
// ---------------------------------------------------------------------------
export const JS_FORMAT_DATETIME = `
  function formatDateTime(value) {
    if (!value) return "--";
    return new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(value));
  }
`;

// ---------------------------------------------------------------------------
// Client-side JS: full date formatting (for tooltips)
// ---------------------------------------------------------------------------
export const JS_FORMAT_FULL_DATETIME = `
  function formatFullDateTime(value) {
    if (!value) return "--";
    try {
      return new Date(value).toLocaleString("zh-CN", { hour12: false });
    } catch (e) {
      return value;
    }
  }
`;

// ---------------------------------------------------------------------------
// Client-side JS: clipboard copy with fallback
// ---------------------------------------------------------------------------
export const JS_COPY_TEXT = `
  async function copyText(value, onSuccess, onError) {
    if (!value) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        var textarea = document.createElement("textarea");
        textarea.value = value;
        textarea.setAttribute("readonly", "true");
        textarea.style.position = "absolute";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      if (onSuccess) onSuccess();
    } catch (error) {
      if (onError) onError(error);
    }
  }
`;

// ---------------------------------------------------------------------------
// Client-side JS: DOM list rendering helper
// ---------------------------------------------------------------------------
export const JS_LIST_HELPERS = `
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
    for (var i = 0; i < items.length; i++) {
      element.appendChild(renderItem(items[i]));
    }
  }

  function makeStackItem(title, lines) {
    var item = document.createElement("li");
    item.className = "stack-item";
    var strong = document.createElement("strong");
    strong.textContent = title;
    item.appendChild(strong);
    for (var j = 0; j < lines.length; j++) {
      var small = document.createElement("small");
      small.textContent = lines[j];
      item.appendChild(small);
    }
    return item;
  }

  function makeListItem(title, meta) {
    var item = document.createElement("li");
    item.className = "list-item";
    var t = document.createElement("span");
    t.className = "list-item-title";
    t.textContent = title;
    item.appendChild(t);
    if (meta) {
      var m = document.createElement("span");
      m.className = "list-item-meta";
      m.textContent = meta;
      item.appendChild(m);
    }
    return item;
  }
`;

// ---------------------------------------------------------------------------
// Assembled client JS utilities — include once per page
// ---------------------------------------------------------------------------
export function clientUtilScripts(): string {
  return [
    JS_FORMAT_RELATIVE_TIME,
    JS_FORMAT_DATETIME,
    JS_FORMAT_FULL_DATETIME,
    JS_COPY_TEXT,
    JS_LIST_HELPERS,
  ].join("\n");
}
