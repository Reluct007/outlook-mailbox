import { baseStyles, JS_THEME_TOGGLE } from "./shared-styles";

export function renderLoginPage(): string {
  const css = `
    ${baseStyles()}
    
    .login-container {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    
    .login-card {
      width: 100%;
      max-width: 420px;
      padding: 32px 40px;
    }
    
    .login-brand {
      font-family: "JetBrains Mono", monospace;
      font-weight: 800;
      font-size: 1.4rem;
      letter-spacing: -0.02em;
      text-align: center;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      color: var(--text);
    }

    .login-subtitle {
      text-align: center;
      color: var(--text-tertiary);
      font-size: 0.85rem;
      margin-bottom: 32px;
      font-weight: 600;
      letter-spacing: 0.06em;
    }
    
    .form-group {
      margin-bottom: 18px;
    }
    
    .form-group label {
      display: block;
      margin-bottom: 8px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-secondary);
    }
    
    .login-btn {
      width: 100%;
      margin-top: 12px;
      padding: 14px;
      font-size: 1rem;
    }
    
    .error-msg {
      color: var(--danger);
      font-size: 0.85rem;
      margin-top: 16px;
      text-align: center;
      display: none;
      background: var(--danger-dim);
      padding: 10px;
      border-radius: var(--radius-xs);
    }
    
    .theme-wrapper {
      position: absolute;
      top: 24px;
      right: 24px;
    }
  `;

  const js = `
    ${JS_THEME_TOGGLE}
    
    document.addEventListener('DOMContentLoaded', () => {
      const form = document.getElementById('login-form');
      const errBox = document.getElementById('error-box');
      const btn = document.getElementById('submit-btn');
      
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errBox.style.display = 'none';
        btn.disabled = true;
        btn.textContent = 'Authenticating...';
        
        try {
          const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              username: form.username.value,
              password: form.password.value
            })
          });
          
          if (res.ok) {
            window.location.reload(); // Reload current page to seamlessly land on target
          } else {
            const data = await res.json();
            errBox.textContent = data.message || 'Authentication failed';
            errBox.style.display = 'block';
            btn.disabled = false;
            btn.textContent = 'Login';
          }
        } catch (err) {
          errBox.textContent = 'Network error. Please try again.';
          errBox.style.display = 'block';
          btn.disabled = false;
          btn.textContent = 'Login';
        }
      });
    });
  `;

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Login - Outlook Mailbox</title>
      <style>${css}</style>
    </head>
    <body data-theme="light">
      <div class="theme-wrapper">
        <button class="theme-toggle" id="theme-toggle" type="button" onclick="window.__toggleTheme()">
          ☾
        </button>
      </div>
      
      <div class="login-container">
        <div class="card login-card animate-in">
          <div class="login-brand">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--accent);">
              <path d="M21.2 8.4c.5.38.8.97.8 1.6v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V10a2 2 0 0 1 .8-1.6l8-6a2 2 0 0 1 2.4 0l8 6Z"></path>
              <path d="m22 10-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 10"></path>
            </svg>
            Mailbox System
          </div>
          <div class="login-subtitle">SECURE OPERATOR ACCESS</div>
          
          <form id="login-form">
            <div class="form-group">
              <label for="username">Operator Name</label>
              <input type="text" id="username" name="username" class="input" placeholder="e.g. world" required autofocus />
            </div>
            
            <div class="form-group">
              <label for="password">Password</label>
              <input type="password" id="password" name="password" class="input" placeholder="Enter password" required />
            </div>
            
            <button type="submit" id="submit-btn" class="btn btn-primary login-btn">Login</button>
            <div id="error-box" class="error-msg"></div>
          </form>
        </div>
      </div>
      <script>${js}</script>
    </body>
    </html>
  `;
}
