const fs = require('fs');
const path = require('path');

function copyFolderRecursive(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (let entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyFolderRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Create target directories
const vercelDir = path.join(__dirname, 'vercel_customer_frontend');
const pcBackendDir = path.join(__dirname, 'shop_pc_backend');

if (!fs.existsSync(vercelDir)) fs.mkdirSync(vercelDir, { recursive: true });
if (!fs.existsSync(pcBackendDir)) fs.mkdirSync(pcBackendDir, { recursive: true });

// --- 1. BUILD VERCEL CUSTOMER FRONTEND FOLDER ---

// Create public structure inside vercel_customer_frontend
const vercelPublic = path.join(vercelDir, 'public');
const vercelCss = path.join(vercelPublic, 'css');
const vercelJs = path.join(vercelPublic, 'js');
fs.mkdirSync(vercelCss, { recursive: true });
fs.mkdirSync(vercelJs, { recursive: true });

// Copy Customer Static Files
fs.copyFileSync(path.join(__dirname, 'public', 'index.html'), path.join(vercelPublic, 'index.html'));
fs.copyFileSync(path.join(__dirname, 'public', 'success.html'), path.join(vercelPublic, 'success.html'));
fs.copyFileSync(path.join(__dirname, 'public', 'css', 'style.css'), path.join(vercelCss, 'style.css'));

// Configurable Customer JS for Vercel pointing to Shop PC
const customerJsVercel = `document.addEventListener('DOMContentLoaded', () => {
  // Set your Shop PC Backend URL here (e.g. 'https://your-shop-tunnel.trycloudflare.com' or 'https://192.168.29.155:3000')
  // If left empty (''), it automatically uses the relative API on the same host.
  const SHOP_PC_BACKEND_URL = window.SHOP_PC_BACKEND_URL || '';

  const getApiUrl = (endpoint) => SHOP_PC_BACKEND_URL ? (SHOP_PC_BACKEND_URL + endpoint) : endpoint;

  const shopHeaderName = document.getElementById('shopHeaderName');
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const uploadStatus = document.getElementById('uploadStatus');

  const uploadCard = document.getElementById('uploadCard');
  const optionsCard = document.getElementById('optionsCard');
  const fileNameDisplay = document.getElementById('fileNameDisplay');
  const pageCountDisplay = document.getElementById('pageCountDisplay');
  const changeFileBtn = document.getElementById('changeFileBtn');

  const radioBw = document.getElementById('radioBw');
  const radioColor = document.getElementById('radioColor');
  const bwRateDisplay = document.getElementById('bwRateDisplay');
  const colorRateDisplay = document.getElementById('colorRateDisplay');
  const copiesInput = document.getElementById('copiesInput');

  const sumPages = document.getElementById('sumPages');
  const sumRate = document.getElementById('sumRate');
  const sumCopies = document.getElementById('sumCopies');
  const sumTotal = document.getElementById('sumTotal');
  const payBtn = document.getElementById('payBtn');

  let currentFile = null;
  let pageCount = 1;
  let bwRate = 2;
  let colorRate = 10;
  let selectedColorMode = 'bw';

  let customerSessionId = localStorage.getItem('kiosk_session_id');
  if (!customerSessionId) {
    customerSessionId = 'cust_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    localStorage.setItem('kiosk_session_id', customerSessionId);
  }

  // Load status & pricing from Shop PC Backend
  fetch(getApiUrl('/api/status'))
    .then(res => res.json())
    .then(data => {
      if (data.shop_name) shopHeaderName.textContent = data.shop_name;
      bwRate = parseFloat(data.bw_rate) || 2;
      colorRate = parseFloat(data.color_rate) || 10;
      bwRateDisplay.textContent = '₹' + bwRate.toFixed(2) + ' / page';
      colorRateDisplay.textContent = '₹' + colorRate.toFixed(2) + ' / page';
      updateCalculation();
    })
    .catch(() => {});

  dropzone.addEventListener('click', () => fileInput.click());

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = 'var(--primary-hover)';
    dropzone.style.background = 'rgba(79, 70, 229, 0.08)';
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.style.borderColor = 'var(--primary)';
    dropzone.style.background = 'rgba(79, 70, 229, 0.02)';
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = 'var(--primary)';
    dropzone.style.background = 'rgba(79, 70, 229, 0.02)';
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFileUpload(e.target.files[0]);
    }
  });

  changeFileBtn.addEventListener('click', () => {
    optionsCard.classList.add('hidden');
    uploadCard.classList.remove('hidden');
    fileInput.value = '';
    currentFile = null;
  });

  radioBw.addEventListener('click', () => {
    selectedColorMode = 'bw';
    radioBw.classList.add('active');
    radioColor.classList.remove('active');
    radioBw.querySelector('input').checked = true;
    updateCalculation();
  });

  radioColor.addEventListener('click', () => {
    selectedColorMode = 'color';
    radioColor.classList.add('active');
    radioBw.classList.remove('active');
    radioColor.querySelector('input').checked = true;
    updateCalculation();
  });

  copiesInput.addEventListener('input', () => {
    updateCalculation();
  });

  async function handleFileUpload(file) {
    uploadStatus.textContent = 'Uploading file to Shop Kiosk...';
    uploadStatus.style.color = 'var(--primary)';
    uploadStatus.classList.remove('hidden');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(getApiUrl('/api/upload'), {
        method: 'POST',
        body: formData
      });
      const data = await res.json();

      if (data.success) {
        currentFile = data;
        pageCount = data.page_count;
        bwRate = data.bw_rate;
        colorRate = data.color_rate;

        fileNameDisplay.textContent = data.original_name;
        pageCountDisplay.textContent = 'Detected page count: ' + pageCount + ' ' + (pageCount === 1 ? 'page' : 'pages');

        uploadCard.classList.add('hidden');
        optionsCard.classList.remove('hidden');
        uploadStatus.classList.add('hidden');
        updateCalculation();
      } else {
        uploadStatus.textContent = data.message || 'File upload failed.';
        uploadStatus.style.color = 'var(--danger)';
      }
    } catch (err) {
      uploadStatus.textContent = 'Error connecting to Shop Kiosk Server.';
      uploadStatus.style.color = 'var(--danger)';
    }
  }

  function updateCalculation() {
    const rate = selectedColorMode === 'color' ? colorRate : bwRate;
    const copies = parseInt(copiesInput.value) || 1;
    const total = (pageCount * rate) * copies;

    sumPages.textContent = pageCount;
    sumRate.textContent = '₹' + rate.toFixed(2);
    sumCopies.textContent = copies;
    sumTotal.textContent = '₹' + total.toFixed(2);
  }

  payBtn.addEventListener('click', async () => {
    if (!currentFile) return;

    payBtn.disabled = true;
    payBtn.textContent = '⏳ Creating Payment Order...';

    const orderPayload = {
      filename: currentFile.file_id,
      original_name: currentFile.original_name,
      file_path: currentFile.file_path,
      page_count: pageCount,
      color_mode: selectedColorMode,
      copies: parseInt(copiesInput.value) || 1,
      customer_session_id: customerSessionId
    };

    try {
      const res = await fetch(getApiUrl('/api/create-order'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPayload)
      });
      const orderData = await res.json();

      if (!orderData.success) {
        alert(orderData.message || 'Failed to create order.');
        payBtn.disabled = false;
        payBtn.textContent = '💳 Pay Now with UPI / QR Code & Print';
        return;
      }

      if (orderData.is_mock || typeof Razorpay === 'undefined') {
        const simulateConfirm = confirm('Razorpay Test Mode Active. Click OK to confirm payment of ₹' + orderData.amount.toFixed(2) + ' and print.');
        if (simulateConfirm) {
          verifyPaymentAndPrint({
            order_id: orderData.order_id,
            razorpay_order_id: orderData.razorpay_order_id,
            razorpay_payment_id: 'pay_sim_' + Date.now(),
            razorpay_signature: 'simulated_signature'
          });
        } else {
          payBtn.disabled = false;
          payBtn.textContent = '💳 Pay Now with UPI / QR Code & Print';
        }
      } else {
        const options = {
          key: orderData.key_id,
          amount: orderData.amount_paise,
          currency: 'INR',
          name: shopHeaderName.textContent || 'Print Shop Kiosk',
          description: 'Print Payment for ' + currentFile.original_name,
          order_id: orderData.razorpay_order_id,
          handler: function (response) {
            verifyPaymentAndPrint({
              order_id: orderData.order_id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature
            });
          },
          theme: { color: '#4f46e5' }
        };
        const rzp = new Razorpay(options);
        rzp.open();
        payBtn.disabled = false;
        payBtn.textContent = '💳 Pay Now with UPI / QR Code & Print';
      }
    } catch (err) {
      alert('Network error initiating payment.');
      payBtn.disabled = false;
      payBtn.textContent = '💳 Pay Now with UPI / QR Code & Print';
    }
  });

  async function verifyPaymentAndPrint(verificationData) {
    payBtn.textContent = '🖨️ Verifying Payment & Triggering Print...';
    try {
      const res = await fetch(getApiUrl('/api/verify-payment'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(verificationData)
      });
      const result = await res.json();
      if (result.success) {
        window.location.href = '/success.html?order_id=' + result.order_id;
      } else {
        alert(result.message || 'Payment verification failed.');
        payBtn.disabled = false;
        payBtn.textContent = '💳 Pay Now with UPI / QR Code & Print';
      }
    } catch (err) {
      alert('Error verifying payment.');
      payBtn.disabled = false;
      payBtn.textContent = '💳 Pay Now with UPI / QR Code & Print';
    }
  }
});
`;

fs.writeFileSync(path.join(vercelJs, 'customer.js'), customerJsVercel, 'utf8');

// Vercel JSON configuration
const vercelJsonConfig = {
  "routes": [
    { "src": "/css/(.*)", "dest": "/public/css/$1" },
    { "src": "/js/(.*)", "dest": "/public/js/$1" },
    { "src": "/success.html", "dest": "/public/success.html" },
    { "src": "/index.html", "dest": "/public/index.html" },
    { "src": "/", "dest": "/public/index.html" }
  ]
};

fs.writeFileSync(path.join(vercelDir, 'vercel.json'), JSON.stringify(vercelJsonConfig, null, 2), 'utf8');

// Gitignore for Vercel
fs.writeFileSync(path.join(vercelDir, '.gitignore'), "node_modules\n.vercel\n.appdata\n.tmp\n", 'utf8');

// Package.json for Vercel Frontend
const vercelPkg = {
  "name": "print-shop-customer-frontend",
  "version": "1.0.0",
  "description": "Customer facing upload & payment portal for Print Shop Kiosk"
};
fs.writeFileSync(path.join(vercelDir, 'package.json'), JSON.stringify(vercelPkg, null, 2), 'utf8');

// --- 2. BUILD SHOP PC BACKEND FOLDER ---
copyFolderRecursive(__dirname, pcBackendDir);

console.log('Separated folders build successfully!');
