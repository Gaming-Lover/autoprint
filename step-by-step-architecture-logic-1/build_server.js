const fs = require('fs');

const serverCode = `const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const DB = require('./db.js');
const { getPdfPageCount } = require('./pdfCounter.js');
const { createRazorpayOrder, verifySignature } = require('./razorpay.js');
const { printFile } = require('./printer.js');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure uploads folder exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer storage setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'file-' + uniqueSuffix + ext);
  }
});
const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Simple in-memory session token store for admin auth
const activeSessions = new Set();

function adminAuthMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    if (activeSessions.has(token)) {
      return next();
    }
  }
  res.status(401).json({ success: false, message: 'Unauthorized. Admin login required.' });
}

// First-boot configuration check middleware for HTML requests
app.use((req, res, next) => {
  const isConfigured = DB.isConfigured();
  
  // Allow API calls, static assets (CSS, JS, images)
  if (req.path.startsWith('/api') || req.path.includes('.') && !req.path.endsWith('.html')) {
    return next();
  }

  // If not configured, force redirect to setup.html
  if (!isConfigured && req.path !== '/setup.html') {
    return res.redirect('/setup.html');
  }

  // If already configured, prevent visiting setup.html
  if (isConfigured && req.path === '/setup.html') {
    return res.redirect('/index.html');
  }

  next();
});

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));

// --- API ENDPOINTS ---

// Check app initialization status
app.get('/api/status', (req, res) => {
  const isConfigured = DB.isConfigured();
  const settings = DB.getSettings();
  res.json({
    is_configured: isConfigured,
    shop_name: settings.shop_name,
    bw_rate: settings.bw_rate,
    color_rate: settings.color_rate,
    razorpay_key_id: settings.razorpay_key_id
  });
});

// Initial First-Boot Setup
app.post('/api/setup', (req, res) => {
  if (DB.isConfigured()) {
    return res.status(400).json({ success: false, message: 'App is already configured.' });
  }

  const { admin_id, password, shop_name, razorpay_key_id, razorpay_key_secret, bw_rate, color_rate } = req.body;
  if (!admin_id || !password) {
    return res.status(400).json({ success: false, message: 'Admin ID and Password are required.' });
  }

  const result = DB.setupInitial({
    admin_id,
    password,
    shop_name,
    razorpay_key_id,
    razorpay_key_secret,
    bw_rate,
    color_rate
  });

  res.json({ success: true, message: 'Setup completed successfully!' });
});

// Admin Login
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username and password required.' });
  }

  const isValid = DB.authenticateUser(username, password);
  if (!isValid) {
    return res.status(401).json({ success: false, message: 'Invalid Admin credentials.' });
  }

  const token = 'token_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  activeSessions.add(token);
  res.json({ success: true, token, username });
});

// Admin Dashboard Stats
app.get('/api/dashboard', adminAuthMiddleware, (req, res) => {
  const stats = DB.getDashboardStats();
  res.json({ success: true, stats });
});

// Get Settings (Admin)
app.get('/api/settings', adminAuthMiddleware, (req, res) => {
  const settings = DB.getSettings();
  res.json({ success: true, settings });
});

// Update Settings (Admin)
app.post('/api/settings', adminAuthMiddleware, (req, res) => {
  const updated = DB.updateSettings(req.body);
  res.json({ success: true, settings: updated });
});

// Customer File Upload & Page Counting
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded.' });
  }

  const filePath = req.file.path;
  const pageCount = getPdfPageCount(filePath);
  const settings = DB.getSettings();

  res.json({
    success: true,
    file_id: req.file.filename,
    original_name: req.file.originalname,
    file_path: filePath,
    page_count: pageCount,
    bw_rate: settings.bw_rate,
    color_rate: settings.color_rate
  });
});

// Create Print Order & Razorpay Payment Order
app.post('/api/create-order', async (req, res) => {
  const { filename, original_name, file_path, page_count, color_mode, copies, customer_session_id } = req.body;

  if (!filename || !file_path || !page_count) {
    return res.status(400).json({ success: false, message: 'Missing required file details.' });
  }

  const settings = DB.getSettings();
  const colorMode = color_mode === 'color' ? 'color' : 'bw';
  const ratePerPage = colorMode === 'color' ? settings.color_rate : settings.bw_rate;
  const numCopies = parseInt(copies) || 1;
  const pages = parseInt(page_count) || 1;
  const totalAmount = (pages * ratePerPage) * numCopies;

  // Generate Razorpay Order
  const rzpResult = await createRazorpayOrder(
    settings.razorpay_key_id,
    settings.razorpay_key_secret,
    totalAmount,
    'print_' + Date.now()
  );

  // Save Order in DB
  const dbOrder = DB.createOrder({
    filename,
    original_name,
    file_path,
    page_count: pages,
    color_mode: colorMode,
    copies: numCopies,
    rate_per_page: ratePerPage,
    total_amount: totalAmount,
    customer_session_id,
    razorpay_order_id: rzpResult.order_id
  });

  res.json({
    success: true,
    order_id: dbOrder.id,
    razorpay_order_id: rzpResult.order_id,
    amount: totalAmount,
    amount_paise: Math.round(totalAmount * 100),
    currency: 'INR',
    key_id: rzpResult.key_id || settings.razorpay_key_id,
    page_count: pages,
    rate_per_page: ratePerPage,
    copies: numCopies,
    color_mode: colorMode,
    original_name,
    is_mock: rzpResult.is_mock
  });
});

// Verify Payment & Trigger Print Execution
app.post('/api/verify-payment', async (req, res) => {
  const { order_id, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  const order = DB.getOrder(order_id || razorpay_order_id);
  if (!order) {
    return res.status(404).json({ success: false, message: 'Order not found.' });
  }

  const settings = DB.getSettings();
  const isValid = verifySignature(
    razorpay_order_id || order.razorpay_order_id,
    razorpay_payment_id || 'pay_mock_' + Date.now(),
    razorpay_signature || '',
    settings.razorpay_key_secret
  );

  if (!isValid) {
    DB.updateOrderPayment(order.id, razorpay_payment_id, razorpay_order_id, 'failed');
    return res.status(400).json({ success: false, message: 'Payment verification failed.' });
  }

  // Update Payment Status
  DB.updateOrderPayment(order.id, razorpay_payment_id || ('pay_sim_' + Date.now()), razorpay_order_id, 'success');

  // Trigger Print Command
  const printResult = await printFile(order.file_path, {
    copies: order.copies,
    colorMode: order.color_mode
  });

  // Update Print Status
  DB.updateOrderPrintStatus(order.id, printResult.status);

  res.json({
    success: true,
    message: 'Payment verified and print job initiated!',
    print_status: printResult.status,
    order_id: order.id
  });
});

// Get Single Order Details
app.get('/api/order/:id', (req, res) => {
  const order = DB.getOrder(req.params.id);
  if (!order) {
    return res.status(404).json({ success: false, message: 'Order not found.' });
  }
  res.json({ success: true, order });
});

// Reset Settings & Factory Reset
app.post('/api/reset-settings', adminAuthMiddleware, (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ success: false, message: 'Admin password is required for factory reset.' });
  }

  const resetResult = DB.resetDatabase(password);
  if (!resetResult.success) {
    return res.status(401).json({ success: false, message: resetResult.message });
  }

  // Clear active admin sessions on reset
  activeSessions.clear();

  res.json({
    success: true,
    message: 'Settings and database reset successfully. App restarted to setup mode.'
  });
});

// Fallback Route for HTML pages
app.get('*', (req, res) => {
  const isConfigured = DB.isConfigured();
  if (!isConfigured) {
    return res.redirect('/setup.html');
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('===================================================');
  console.log(' Print Shop Kiosk Server is active and listening!');
  console.log(' Local Access: http://localhost:' + PORT);
  console.log(' Admin Panel: http://localhost:' + PORT + '/admin.html');
  console.log(' Customer Page: http://localhost:' + PORT + '/index.html');
  console.log('===================================================');
});
`;

fs.writeFileSync('server.js', serverCode, 'utf8');
console.log('server.js written');
