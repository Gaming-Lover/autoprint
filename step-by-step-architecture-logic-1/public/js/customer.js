document.addEventListener('DOMContentLoaded', () => {
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
