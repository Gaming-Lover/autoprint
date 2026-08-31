document.addEventListener('DOMContentLoaded', () => {
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
