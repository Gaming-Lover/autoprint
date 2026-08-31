const fs = require('fs');

const customerHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Self-Service Print Kiosk</title>
  <link rel="stylesheet" href="/css/style.css">
  <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
</head>
<body>
  <header>
    <div class="brand">
      <span>🖨️</span> <span id="shopHeaderName">Self-Service Print Kiosk</span>
    </div>
    <div class="header-actions">
      <a href="/login.html" class="btn btn-secondary" style="font-size: 0.85rem; padding: 0.4rem 0.8rem;">Admin Login</a>
    </div>
  </header>

  <main class="container" style="max-width: 700px;">
    <!-- Step 1: File Upload -->
    <div class="card" id="uploadCard">
      <div class="card-title">Upload Your Document</div>
      <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 1.5rem;">
        Select or drag a PDF document or image file (.pdf, .jpg, .png) to begin printing.
      </p>

      <div class="dropzone" id="dropzone">
        <div class="dropzone-icon">📄</div>
        <p style="font-weight: 600; font-size: 1.1rem; margin-bottom: 0.5rem;">Click or Drag & Drop File Here</p>
        <p style="color: var(--text-muted); font-size: 0.85rem;">Supports PDF, PNG, JPG (Max 50MB)</p>
        <input type="file" id="fileInput" accept=".pdf,.jpg,.jpeg,.png" style="display: none;">
      </div>
      <div id="uploadStatus" style="margin-top: 1rem; text-align: center; font-size: 0.95rem;" class="hidden"></div>
    </div>

    <!-- Step 2: Print Options & Cost Summary -->
    <div class="card hidden" id="optionsCard">
      <div class="card-title">Configure Print Options</div>
      
      <div style="background: #f1f5f9; padding: 1rem; border-radius: 8px; margin-bottom: 1.5rem; display: flex; align-items: center; justify-content: space-between;">
        <div>
          <div style="font-weight: 600;" id="fileNameDisplay">document.pdf</div>
          <div style="font-size: 0.85rem; color: var(--text-muted);" id="pageCountDisplay">Page count: 1 page</div>
        </div>
        <button id="changeFileBtn" class="btn btn-secondary" style="font-size: 0.8rem; padding: 0.3rem 0.6rem;">Change File</button>
      </div>

      <div class="form-group">
        <label>Print Color Mode</label>
        <div class="radio-group">
          <div class="radio-card active" id="radioBw">
            <input type="radio" name="colorMode" value="bw" checked>
            <div>Black & White (B&W)</div>
            <div style="font-size: 0.8rem; color: var(--text-muted);" id="bwRateDisplay">₹2.00 / page</div>
          </div>
          <div class="radio-card" id="radioColor">
            <input type="radio" name="colorMode" value="color">
            <div>Color Print</div>
            <div style="font-size: 0.8rem; color: var(--text-muted);" id="colorRateDisplay">₹10.00 / page</div>
          </div>
        </div>
      </div>

      <div class="form-group">
        <label for="copiesInput">Number of Copies</label>
        <input type="number" id="copiesInput" class="form-control" value="1" min="1" max="100">
      </div>

      <!-- Cost Calculation Breakdown -->
      <div style="background: #faf5ff; border: 1px solid #e9d5ff; padding: 1.25rem; border-radius: 8px; margin-top: 1.5rem;">
        <div style="font-weight: 600; color: #6b21a8; margin-bottom: 0.75rem;">Price Calculation Breakdown</div>
        <div class="summary-row">
          <span>Pages in Document:</span>
          <span id="sumPages">1</span>
        </div>
        <div class="summary-row">
          <span>Rate per Page:</span>
          <span id="sumRate">₹2.00</span>
        </div>
        <div class="summary-row">
          <span>Number of Copies:</span>
          <span id="sumCopies">1</span>
        </div>
        <div class="summary-row summary-total">
          <span>Total Amount Payable:</span>
          <span id="sumTotal">₹2.00</span>
        </div>
      </div>

      <div style="margin-top: 1.5rem;">
        <button id="payBtn" class="btn btn-primary btn-block" style="font-size: 1.1rem; padding: 1rem;">
          💳 Pay Now with UPI / QR Code & Print
        </button>
      </div>
    </div>
  </main>

  <script src="/js/customer.js"></script>
</body>
</html>
`;

const customerJs = `document.addEventListener('DOMContentLoaded', () => {
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

  // Customer session identifier
  let customerSessionId = localStorage.getItem('kiosk_session_id');
  if (!customerSessionId) {
    customerSessionId = 'cust_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    localStorage.setItem('kiosk_session_id', customerSessionId);
  }

  // Load status & shop settings
  fetch('/api/status')
    .then(res => res.json())
    .then(data => {
      if (!data.is_configured) {
        window.location.href = '/setup.html';
        return;
      }
      if (data.shop_name) shopHeaderName.textContent = data.shop_name;
      bwRate = parseFloat(data.bw_rate) || 2;
      colorRate = parseFloat(data.color_rate) || 10;
      bwRateDisplay.textContent = '₹' + bwRate.toFixed(2) + ' / page';
      colorRateDisplay.textContent = '₹' + colorRate.toFixed(2) + ' / page';
      updateCalculation();
    });

  // Dropzone click & drag handlers
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

  // Radio button color selection
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
    uploadStatus.textContent = 'Uploading file & parsing pages...';
    uploadStatus.style.color = 'var(--primary)';
    uploadStatus.classList.remove('hidden');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/upload', {
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
      uploadStatus.textContent = 'Error uploading file. Please try again.';
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

  // Payment Execution & Order Submission
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
      const res = await fetch('/api/create-order', {
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

      // Check if Razorpay Key is available or if running mock payment
      if (orderData.is_mock || typeof Razorpay === 'undefined') {
        // Trigger simulation flow
        const simulateConfirm = confirm('Razorpay test mode active. Click OK to simulate instant UPI / QR payment confirmation of ₹' + orderData.amount.toFixed(2));
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
        // Open standard Razorpay Modal UI
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
      const res = await fetch('/api/verify-payment', {
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

const successHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Print Completed - Print Kiosk</title>
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
  <header>
    <div class="brand">
      <span>🖨️</span> Self-Service Print Kiosk
    </div>
  </header>

  <main class="container" style="max-width: 550px; text-align: center; margin-top: 3rem;">
    <div class="card">
      <div style="font-size: 4rem; color: var(--success); margin-bottom: 1rem;">✅</div>
      <h2 style="margin-bottom: 0.5rem; color: var(--text);">Payment Successful & Print Initiated!</h2>
      <p style="color: var(--text-muted); margin-bottom: 1.5rem;">
        Your document has been sent to the printer queue. Please collect your printouts from the tray.
      </p>

      <div style="background: #f8fafc; border: 1px solid var(--border); padding: 1rem; border-radius: 8px; text-align: left; margin-bottom: 1.5rem; font-size: 0.9rem;" id="orderDetails">
        <div><strong>Order ID:</strong> <span id="outOrderId">Loading...</span></div>
        <div><strong>File:</strong> <span id="outFile">...</span></div>
        <div><strong>Total Paid:</strong> <span id="outTotal">...</span></div>
        <div><strong>Status:</strong> <span class="badge badge-success">Print Job Queued</span></div>
      </div>

      <a href="/index.html" class="btn btn-primary btn-block">Print Another Document</a>
    </div>
  </main>

  <script>
    document.addEventListener('DOMContentLoaded', async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const orderId = urlParams.get('order_id');
      if (orderId) {
        try {
          const res = await fetch('/api/order/' + orderId);
          const data = await res.json();
          if (data.success && data.order) {
            document.getElementById('outOrderId').textContent = data.order.id;
            document.getElementById('outFile').textContent = data.order.original_name + ' (' + data.order.page_count + ' pgs, ' + data.order.copies + ' copies)';
            document.getElementById('outTotal').textContent = '₹' + data.order.total_amount.toFixed(2);
          }
        } catch (e) {}
      }
    });
  </script>
</body>
</html>
`;

fs.writeFileSync('public/index.html', customerHtml, 'utf8');
fs.writeFileSync('public/js/customer.js', customerJs, 'utf8');
fs.writeFileSync('public/success.html', successHtml, 'utf8');
console.log('index.html, customer.js, and success.html written');
