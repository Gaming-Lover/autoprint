document.addEventListener('DOMContentLoaded', () => {
  const setupForm = document.getElementById('setupForm');
  const errorMsg = document.getElementById('errorMsg');

  // Check if app is already configured
  fetch('/api/status')
    .then(res => res.json())
    .then(data => {
      if (data.is_configured) {
        window.location.href = '/index.html';
      }
    });

  setupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorMsg.classList.add('hidden');

    const configData = {
      admin_id: document.getElementById('admin_id').value.trim(),
      password: document.getElementById('password').value,
      shop_name: document.getElementById('shop_name').value.trim(),
      bw_rate: document.getElementById('bw_rate').value,
      color_rate: document.getElementById('color_rate').value,
      razorpay_key_id: document.getElementById('razorpay_key_id').value.trim(),
      razorpay_key_secret: document.getElementById('razorpay_key_secret').value.trim()
    };

    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configData)
      });
      const result = await res.json();

      if (result.success) {
        alert('Configuration saved! Redirecting to Admin Login...');
        window.location.href = '/login.html';
      } else {
        errorMsg.textContent = result.message || 'Setup failed. Please check inputs.';
        errorMsg.classList.remove('hidden');
      }
    } catch (err) {
      errorMsg.textContent = 'Server error during setup. Please try again.';
      errorMsg.classList.remove('hidden');
    }
  });
});
