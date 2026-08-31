const fs = require('fs');

const adminHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Admin Panel - Print Shop Kiosk</title>
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
  <header>
    <div class="brand">
      <span>📊</span> <span id="shopTitleName">Print Shop</span> Admin Panel
    </div>
    <div class="header-actions">
      <a href="/index.html" class="btn btn-secondary" style="font-size: 0.85rem; padding: 0.4rem 0.8rem;">Open Customer Kiosk UI</a>
      <button id="resetSettingsBtn" class="icon-btn" title="Factory Reset Settings">
        ⚙️ Settings Reset
      </button>
      <button id="logoutBtn" class="btn btn-secondary" style="font-size: 0.85rem; padding: 0.4rem 0.8rem;">Logout</button>
    </div>
  </header>

  <main class="container">
    <!-- Stat Cards -->
    <div class="grid-3" style="margin-bottom: 2rem;">
      <div class="stat-card">
        <div class="stat-title">Total Customers</div>
        <div class="stat-value" id="statCustomers">0</div>
      </div>
      <div class="stat-card">
        <div class="stat-title">Total Pages Printed</div>
        <div class="stat-value" id="statPrintouts">0</div>
      </div>
      <div class="stat-card">
        <div class="stat-title">Total Earnings (₹)</div>
        <div class="stat-value" id="statPayments">₹0.00</div>
      </div>
    </div>

    <!-- Tab Section: Orders & Settings -->
    <div class="card">
      <div class="card-title">
        <div style="display: flex; gap: 1rem;">
          <button id="tabOrdersBtn" class="btn btn-primary" style="padding: 0.4rem 1rem;">Recent Orders</button>
          <button id="tabSettingsBtn" class="btn btn-secondary" style="padding: 0.4rem 1rem;">Kiosk Settings</button>
        </div>
        <button id="refreshBtn" class="btn btn-secondary" style="font-size: 0.85rem; padding: 0.3rem 0.7rem;">🔄 Refresh</button>
      </div>

      <!-- Tab 1: Orders -->
      <div id="ordersTabContent">
        <div style="overflow-x: auto;">
          <table>
            <thead>
              <tr>
                <th>Order ID</th>
                <th>File Name</th>
                <th>Pages</th>
                <th>Mode</th>
                <th>Copies</th>
                <th>Total (₹)</th>
                <th>Payment</th>
                <th>Print Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody id="ordersTableBody">
              <tr>
                <td colspan="9" style="text-align: center; color: var(--text-muted);">Loading orders...</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Tab 2: Settings -->
      <div id="settingsTabContent" class="hidden">
        <form id="settingsForm">
          <div class="form-group">
            <label for="set_shop_name">Shop Name</label>
            <input type="text" id="set_shop_name" class="form-control" required>
          </div>
          <div class="grid-2">
            <div class="form-group">
              <label for="set_bw_rate">B&W Rate per Page (₹)</label>
              <input type="number" step="0.5" id="set_bw_rate" class="form-control" required>
            </div>
            <div class="form-group">
              <label for="set_color_rate">Color Rate per Page (₹)</label>
              <input type="number" step="0.5" id="set_color_rate" class="form-control" required>
            </div>
          </div>
          <div class="form-group">
            <label for="set_razorpay_key_id">Razorpay Key ID</label>
            <input type="text" id="set_razorpay_key_id" class="form-control" placeholder="rzp_test_XXXXXX">
          </div>
          <div class="form-group">
            <label for="set_razorpay_key_secret">Razorpay Key Secret</label>
            <input type="password" id="set_razorpay_key_secret" class="form-control" placeholder="Leave blank to keep unchanged">
          </div>
          <div id="settingsMsg" style="margin-bottom: 1rem; font-size: 0.9rem;" class="hidden"></div>
          <button type="submit" class="btn btn-primary">Save Settings</button>
        </form>
      </div>
    </div>
  </main>

  <!-- Reset Confirmation Modal -->
  <div id="resetModal" class="modal-overlay hidden">
    <div class="modal-content">
      <h3 style="color: var(--danger); margin-bottom: 1rem;">⚠️ Factory Reset Application</h3>
      <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 1.5rem;">
        This action will erase all shop settings, user accounts, and history. The app will return to the initial setup screen.
      </p>
      <form id="resetForm">
        <div class="form-group">
          <label for="resetPassword">Enter Admin Password to Confirm</label>
          <input type="password" id="resetPassword" class="form-control" placeholder="••••••••" required>
        </div>
        <div id="resetErrorMsg" style="color: var(--danger); font-size: 0.85rem; margin-bottom: 1rem;" class="hidden"></div>
        <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
          <button type="button" id="closeResetModalBtn" class="btn btn-secondary">Cancel</button>
          <button type="submit" class="btn btn-danger">Confirm Reset</button>
        </div>
      </form>
    </div>
  </div>

  <script src="/js/admin.js"></script>
</body>
</html>
`;

const adminJs = `document.addEventListener('DOMContentLoaded', () => {
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

      return \`
        <tr>
          <td><code style="font-size: 0.8rem;">\${o.id.substring(0, 14)}...</code></td>
          <td title="\${o.original_name}">\${o.original_name.substring(0, 20)}</td>
          <td>\${o.page_count}</td>
          <td>\${o.color_mode.toUpperCase()}</td>
          <td>\${o.copies}</td>
          <td><strong>₹\${o.total_amount.toFixed(2)}</strong></td>
          <td>\${pBadge}</td>
          <td>\${prBadge}</td>
          <td style="font-size: 0.8rem; color: var(--text-muted);">\${dateStr}</td>
        </tr>
      \`;
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
`;

fs.writeFileSync('public/admin.html', adminHtml, 'utf8');
fs.writeFileSync('public/js/admin.js', adminJs, 'utf8');
console.log('admin.html and admin.js written');
