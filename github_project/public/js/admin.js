document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('adminToken');
  if (!token) {
    window.location.href = '/login.html';
    return;
  }

  const authHeaders = {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json'
  };

  const statCustomers = document.getElementById('statCustomers');
  const statPrintouts = document.getElementById('statPrintouts');
  const statPayments = document.getElementById('statPayments');
  const ordersTableBody = document.getElementById('ordersTableBody');
  const shopTitleName = document.getElementById('shopTitleName');

  const tabOrdersBtn = document.getElementById('tabOrdersBtn');
  const tabSettingsBtn = document.getElementById('tabSettingsBtn');
  const ordersTabContent = document.getElementById('ordersTabContent');
  const settingsTabContent = document.getElementById('settingsTabContent');
  const refreshBtn = document.getElementById('refreshBtn');
  const logoutBtn = document.getElementById('logoutBtn');

  const resetSettingsBtn = document.getElementById('resetSettingsBtn');
  const resetModal = document.getElementById('resetModal');
  const closeResetModalBtn = document.getElementById('closeResetModalBtn');
  const resetForm = document.getElementById('resetForm');
  const resetErrorMsg = document.getElementById('resetErrorMsg');

  // Tab switcher
  tabOrdersBtn.addEventListener('click', () => {
    tabOrdersBtn.className = 'btn btn-primary';
    tabSettingsBtn.className = 'btn btn-secondary';
    ordersTabContent.classList.remove('hidden');
    settingsTabContent.classList.add('hidden');
  });

  tabSettingsBtn.addEventListener('click', () => {
    tabSettingsBtn.className = 'btn btn-primary';
    tabOrdersBtn.className = 'btn btn-secondary';
    settingsTabContent.classList.remove('hidden');
    ordersTabContent.classList.add('hidden');
    loadSettings();
  });

  logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminUsername');
    window.location.href = '/login.html';
  });

  refreshBtn.addEventListener('click', () => {
    loadDashboardStats();
  });

  // Load Dashboard Data
  async function loadDashboardStats() {
    try {
      const res = await fetch('/api/dashboard', { headers: authHeaders });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        window.location.href = '/login.html';
        return;
      }
      const data = await res.json();
      if (data.success) {
        const stats = data.stats;
        statCustomers.textContent = stats.total_customers;
        statPrintouts.textContent = stats.total_printouts;
        statPayments.textContent = '₹' + stats.total_payments.toFixed(2);

        renderOrders(stats.recent_orders);
      }
    } catch (err) {
      console.error('Error loading dashboard stats:', err);
    }
  }

  function renderOrders(orders) {
    if (!orders || orders.length === 0) {
      ordersTableBody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: var(--text-muted);">No orders recorded yet.</td></tr>';
      return;
    }

    ordersTableBody.innerHTML = orders.map(o => {
      const pBadge = o.payment_status === 'success' || o.payment_status === 'completed'
        ? '<span class="badge badge-success">Paid</span>'
        : (o.payment_status === 'failed' ? '<span class="badge badge-failed">Failed</span>' : '<span class="badge badge-pending">Pending</span>');
      
      const prBadge = o.print_status === 'completed' || o.print_status === 'completed_simulated'
        ? '<span class="badge badge-success">Printed</span>'
        : '<span class="badge badge-pending">Pending</span>';

      const dateStr = new Date(o.created_at).toLocaleString();

      return `
        <tr>
          <td><code style="font-size: 0.8rem;">${o.id.substring(0, 14)}...</code></td>
          <td title="${o.original_name}">${o.original_name.substring(0, 20)}</td>
          <td>${o.page_count}</td>
          <td>${o.color_mode.toUpperCase()}</td>
          <td>${o.copies}</td>
          <td><strong>₹${o.total_amount.toFixed(2)}</strong></td>
          <td>${pBadge}</td>
          <td>${prBadge}</td>
          <td style="font-size: 0.8rem; color: var(--text-muted);">${dateStr}</td>
        </tr>
      `;
    }).join('');
  }

  // Load Settings
  async function loadSettings() {
    try {
      const res = await fetch('/api/settings', { headers: authHeaders });
      const data = await res.json();
      if (data.success) {
        const s = data.settings;
        document.getElementById('set_shop_name').value = s.shop_name || '';
        document.getElementById('set_bw_rate').value = s.bw_rate || 2;
        document.getElementById('set_color_rate').value = s.color_rate || 10;
        document.getElementById('set_razorpay_key_id').value = s.razorpay_key_id || '';
        shopTitleName.textContent = s.shop_name || 'Print Shop';
      }
    } catch (err) {
      console.error('Error loading settings:', err);
    }
  }

  // Submit Settings Form
  document.getElementById('settingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const settingsMsg = document.getElementById('settingsMsg');
    settingsMsg.classList.add('hidden');

    const payload = {
      shop_name: document.getElementById('set_shop_name').value.trim(),
      bw_rate: document.getElementById('set_bw_rate').value,
      color_rate: document.getElementById('set_color_rate').value,
      razorpay_key_id: document.getElementById('set_razorpay_key_id').value.trim()
    };

    const secretInput = document.getElementById('set_razorpay_key_secret').value.trim();
    if (secretInput) payload.razorpay_key_secret = secretInput;

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(payload)
      });
      const result = await res.json();
      if (result.success) {
        settingsMsg.textContent = 'Settings updated successfully!';
        settingsMsg.style.color = 'var(--success)';
        settingsMsg.classList.remove('hidden');
        shopTitleName.textContent = payload.shop_name;
      }
    } catch (err) {
      settingsMsg.textContent = 'Failed to update settings.';
      settingsMsg.style.color = 'var(--danger)';
      settingsMsg.classList.remove('hidden');
    }
  });

  // Factory Reset Modal Controls
  resetSettingsBtn.addEventListener('click', () => {
    resetModal.classList.remove('hidden');
  });

  closeResetModalBtn.addEventListener('click', () => {
    resetModal.classList.add('hidden');
    resetForm.reset();
    resetErrorMsg.classList.add('hidden');
  });

  resetForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    resetErrorMsg.classList.add('hidden');
    const password = document.getElementById('resetPassword').value;

    try {
      const res = await fetch('/api/reset-settings', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ password })
      });
      const result = await res.json();

      if (result.success) {
        alert('Factory reset completed. Redirecting to initial setup screen...');
        localStorage.clear();
        window.location.href = '/setup.html';
      } else {
        resetErrorMsg.textContent = result.message || 'Incorrect password.';
        resetErrorMsg.classList.remove('hidden');
      }
    } catch (err) {
      resetErrorMsg.textContent = 'Error during reset process.';
      resetErrorMsg.classList.remove('hidden');
    }
  });

  // Initial Load
  loadDashboardStats();
  loadSettings();
});
