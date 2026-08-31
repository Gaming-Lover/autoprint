const fs = require('fs');

const loginHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Admin Login - Print Kiosk</title>
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
  <header>
    <div class="brand">
      <span>🔒</span> Admin Dashboard Login
    </div>
    <div>
      <a href="/index.html" class="btn btn-secondary" style="font-size: 0.85rem; padding: 0.4rem 0.8rem;">Go to Customer Page</a>
    </div>
  </header>

  <main class="container" style="max-width: 450px; margin-top: 4rem;">
    <div class="card">
      <div class="card-title" style="justify-content: center; margin-bottom: 1.5rem;">
        Admin Authentication
      </div>

      <form id="loginForm">
        <div class="form-group">
          <label for="username">Admin Username</label>
          <input type="text" id="username" class="form-control" placeholder="admin" required>
        </div>
        <div class="form-group">
          <label for="password">Password</label>
          <input type="password" id="password" class="form-control" placeholder="••••••••" required>
        </div>

        <div id="errorMsg" style="color: var(--danger); font-size: 0.9rem; margin-bottom: 1rem;" class="hidden"></div>

        <button type="submit" class="btn btn-primary btn-block">Sign In to Dashboard</button>
      </form>
    </div>
  </main>

  <script src="/js/login.js"></script>
</body>
</html>
`;

const loginJs = `document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  const errorMsg = document.getElementById('errorMsg');

  // If already logged in, redirect to admin
  const token = localStorage.getItem('adminToken');
  if (token) {
    window.location.href = '/admin.html';
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorMsg.classList.add('hidden');

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const result = await res.json();
      if (result.success) {
        localStorage.setItem('adminToken', result.token);
        localStorage.setItem('adminUsername', result.username);
        window.location.href = '/admin.html';
      } else {
        errorMsg.textContent = result.message || 'Invalid username or password.';
        errorMsg.classList.remove('hidden');
      }
    } catch (err) {
      errorMsg.textContent = 'Connection error. Please try again.';
      errorMsg.classList.remove('hidden');
    }
  });
});
`;

fs.writeFileSync('public/login.html', loginHtml, 'utf8');
fs.writeFileSync('public/js/login.js', loginJs, 'utf8');
console.log('login.html and login.js written');
