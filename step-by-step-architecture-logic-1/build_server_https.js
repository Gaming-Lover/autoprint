const fs = require('fs');

const serverCode = `const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');

const DB = require('./db.js');
const { getPdfPageCount } = require('./pdfCounter.js');
const { createRazorpayOrder, verifySignature } = require('./razorpay.js');
const { printFile } = require('./printer.js');
const { generateSelfSignedCert } = require('./generateCert.js');

const HTTPS_PORT = process.env.HTTPS_PORT || process.env.PORT || 3000;
const HTTP_PORT = process.env.HTTP_PORT || 3080;

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Generate/load HTTPS SSL Certificates
const sslCerts = generateSelfSignedCert();

const activeSessions = new Set();

function checkAdminAuth(req) {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    return activeSessions.has(token);
  }
  return false;
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

function parseMultipartUpload(req) {
  return new Promise((resolve, reject) => {
    const contentType = req.headers['content-type'] || '';
    const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
    if (!boundaryMatch) {
      return reject(new Error('No multipart boundary found'));
    }
    const boundary = boundaryMatch[1] || boundaryMatch[2];
    const chunks = [];

    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const buffer = Buffer.concat(chunks);
      const boundaryBuf = Buffer.from('--' + boundary);
      const crlfCrlf = Buffer.from([13, 10, 13, 10]);
      const lfLf = Buffer.from([10, 10]);

      let startIdx = 0;
      while (startIdx < buffer.length) {
        const nextBoundary = buffer.indexOf(boundaryBuf, startIdx);
        if (nextBoundary === -1) break;

        let headerStart = nextBoundary + boundaryBuf.length;
        if (buffer[headerStart] === 13 && buffer[headerStart + 1] === 10) {
          headerStart += 2;
        } else if (buffer[headerStart] === 10) {
          headerStart += 1;
        }

        let headerEnd = buffer.indexOf(crlfCrlf, headerStart);
        let headerLen = 4;
        if (headerEnd === -1) {
          headerEnd = buffer.indexOf(lfLf, headerStart);
          headerLen = 2;
        }
        if (headerEnd === -1) break;

        const headersStr = buffer.slice(headerStart, headerEnd).toString('utf8');
        const contentStart = headerEnd + headerLen;
        let contentEnd = buffer.indexOf(boundaryBuf, contentStart);
        if (contentEnd === -1) contentEnd = buffer.length;
        if (buffer[contentEnd - 2] === 13 && buffer[contentEnd - 1] === 10) {
          contentEnd -= 2;
        } else if (buffer[contentEnd - 1] === 10) {
          contentEnd -= 1;
        }

        if (headersStr.includes('name="file"')) {
          const filenameMatch = headersStr.match(/filename="([^"]+)"/);
          const originalName = filenameMatch ? filenameMatch[1] : 'uploaded_doc.pdf';
          const fileData = buffer.slice(contentStart, contentEnd);

          const ext = path.extname(originalName) || '.pdf';
          const fileId = 'file-' + Date.now() + '-' + Math.round(Math.random() * 1E6) + ext;
          const savedPath = path.join(uploadsDir, fileId);

          fs.writeFileSync(savedPath, fileData);
          return resolve({
            file_id: fileId,
            original_name: originalName,
            file_path: savedPath
          });
        }

        startIdx = contentEnd + boundaryBuf.length;
      }
      reject(new Error('File field not found in request'));
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

function serveStaticFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.pdf': 'application/pdf',
    '.json': 'application/json'
  };
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
}

// Core Request Handler
async function requestHandler(req, res) {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const isConfigured = DB.isConfigured();

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  // API Routes
  if (pathname.startsWith('/api/')) {
    if (pathname === '/api/status' && req.method === 'GET') {
      const settings = DB.getSettings();
      return sendJson(res, 200, {
        is_configured: isConfigured,
        shop_name: settings.shop_name,
        bw_rate: settings.bw_rate,
        color_rate: settings.color_rate,
        razorpay_key_id: settings.razorpay_key_id
      });
    }

    if (pathname === '/api/setup' && req.method === 'POST') {
      if (isConfigured) {
        return sendJson(res, 400, { success: false, message: 'App is already configured.' });
      }
      const body = await parseJsonBody(req);
      if (!body.admin_id || !body.password) {
        return sendJson(res, 400, { success: false, message: 'Admin ID and Password are required.' });
      }
      DB.setupInitial(body);
      return sendJson(res, 200, { success: true, message: 'Setup completed successfully!' });
    }

    if (pathname === '/api/auth/login' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const isValid = DB.authenticateUser(body.username, body.password);
      if (!isValid) {
        return sendJson(res, 401, { success: false, message: 'Invalid Admin credentials.' });
      }
      const token = 'token_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      activeSessions.add(token);
      return sendJson(res, 200, { success: true, token, username: body.username });
    }

    if (pathname === '/api/dashboard' && req.method === 'GET') {
      if (!checkAdminAuth(req)) {
        return sendJson(res, 401, { success: false, message: 'Unauthorized' });
      }
      const stats = DB.getDashboardStats();
      return sendJson(res, 200, { success: true, stats });
    }

    if (pathname === '/api/settings' && req.method === 'GET') {
      if (!checkAdminAuth(req)) {
        return sendJson(res, 401, { success: false, message: 'Unauthorized' });
      }
      const settings = DB.getSettings();
      return sendJson(res, 200, { success: true, settings });
    }

    if (pathname === '/api/settings' && req.method === 'POST') {
      if (!checkAdminAuth(req)) {
        return sendJson(res, 401, { success: false, message: 'Unauthorized' });
      }
      const body = await parseJsonBody(req);
      const updated = DB.updateSettings(body);
      return sendJson(res, 200, { success: true, settings: updated });
    }

    if (pathname === '/api/upload' && req.method === 'POST') {
      try {
        const uploadResult = await parseMultipartUpload(req);
        const pageCount = getPdfPageCount(uploadResult.file_path);
        const settings = DB.getSettings();

        return sendJson(res, 200, {
          success: true,
          file_id: uploadResult.file_id,
          original_name: uploadResult.original_name,
          file_path: uploadResult.file_path,
          page_count: pageCount,
          bw_rate: settings.bw_rate,
          color_rate: settings.color_rate
        });
      } catch (err) {
        return sendJson(res, 400, { success: false, message: err.message });
      }
    }

    if (pathname === '/api/create-order' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      if (!body.filename || !body.file_path || !body.page_count) {
        return sendJson(res, 400, { success: false, message: 'Missing required file details.' });
      }

      const settings = DB.getSettings();
      const colorMode = body.color_mode === 'color' ? 'color' : 'bw';
      const ratePerPage = colorMode === 'color' ? settings.color_rate : settings.bw_rate;
      const numCopies = parseInt(body.copies) || 1;
      const pages = parseInt(body.page_count) || 1;
      const totalAmount = (pages * ratePerPage) * numCopies;

      const rzpResult = await createRazorpayOrder(
        settings.razorpay_key_id,
        settings.razorpay_key_secret,
        totalAmount,
        'print_' + Date.now()
      );

      const dbOrder = DB.createOrder({
        filename: body.filename,
        original_name: body.original_name,
        file_path: body.file_path,
        page_count: pages,
        color_mode: colorMode,
        copies: numCopies,
        rate_per_page: ratePerPage,
        total_amount: totalAmount,
        customer_session_id: body.customer_session_id,
        razorpay_order_id: rzpResult.order_id
      });

      return sendJson(res, 200, {
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
        original_name: body.original_name,
        is_mock: rzpResult.is_mock
      });
    }

    if (pathname === '/api/verify-payment' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const order = DB.getOrder(body.order_id || body.razorpay_order_id);
      if (!order) {
        return sendJson(res, 404, { success: false, message: 'Order not found.' });
      }

      const settings = DB.getSettings();
      const isValid = verifySignature(
        body.razorpay_order_id || order.razorpay_order_id,
        body.razorpay_payment_id || 'pay_mock_' + Date.now(),
        body.razorpay_signature || '',
        settings.razorpay_key_secret
      );

      if (!isValid) {
        DB.updateOrderPayment(order.id, body.razorpay_payment_id, body.razorpay_order_id, 'failed');
        return sendJson(res, 400, { success: false, message: 'Payment verification failed.' });
      }

      DB.updateOrderPayment(order.id, body.razorpay_payment_id || ('pay_sim_' + Date.now()), body.razorpay_order_id, 'success');

      const printResult = await printFile(order.file_path, {
        copies: order.copies,
        colorMode: order.color_mode
      });

      DB.updateOrderPrintStatus(order.id, printResult.status);

      return sendJson(res, 200, {
        success: true,
        message: 'Payment verified and print job initiated!',
        print_status: printResult.status,
        order_id: order.id
      });
    }

    if (pathname.startsWith('/api/order/') && req.method === 'GET') {
      const orderId = pathname.replace('/api/order/', '');
      const order = DB.getOrder(orderId);
      if (!order) {
        return sendJson(res, 404, { success: false, message: 'Order not found.' });
      }
      return sendJson(res, 200, { success: true, order });
    }

    if (pathname === '/api/reset-settings' && req.method === 'POST') {
      if (!checkAdminAuth(req)) {
        return sendJson(res, 401, { success: false, message: 'Unauthorized' });
      }
      const body = await parseJsonBody(req);
      if (!body.password) {
        return sendJson(res, 400, { success: false, message: 'Admin password is required for factory reset.' });
      }
      const resetResult = DB.resetDatabase(body.password);
      if (!resetResult.success) {
        return sendJson(res, 401, { success: false, message: resetResult.message });
      }
      activeSessions.clear();
      return sendJson(res, 200, { success: true, message: 'Settings reset successfully. App restarted.' });
    }

    return sendJson(res, 404, { success: false, message: 'API Endpoint not found' });
  }

  let targetFile = pathname;
  if (targetFile === '/') {
    targetFile = isConfigured ? '/index.html' : '/setup.html';
  }

  if (!isConfigured && targetFile !== '/setup.html' && !targetFile.startsWith('/css/') && !targetFile.startsWith('/js/')) {
    res.writeHead(302, { 'Location': '/setup.html' });
    return res.end();
  }
  if (isConfigured && targetFile === '/setup.html') {
    res.writeHead(302, { 'Location': '/index.html' });
    return res.end();
  }

  const safePath = path.join(__dirname, 'public', targetFile);
  serveStaticFile(res, safePath);
}

// 1. Create HTTPS Server (Primary for Razorpay compliance)
const httpsServer = https.createServer(sslCerts, requestHandler);

httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
  console.log('===================================================');
  console.log(' 🔒 HTTPS SECURE PRINT KIOSK SERVER IS ACTIVE!');
  console.log(' 🔒 HTTPS URL: https://localhost:' + HTTPS_PORT);
  console.log(' 🔒 Admin Panel: https://localhost:' + HTTPS_PORT + '/admin.html');
  console.log(' 🔒 Customer Kiosk: https://localhost:' + HTTPS_PORT + '/index.html');
  console.log('===================================================');
});

// 2. HTTP Server to automatically redirect to HTTPS
const httpServer = http.createServer((req, res) => {
  const host = req.headers.host ? req.headers.host.split(':')[0] : 'localhost';
  const redirectUrl = 'https://' + host + ':' + HTTPS_PORT + req.url;
  res.writeHead(301, { 'Location': redirectUrl });
  res.end();
});

httpServer.listen(HTTP_PORT, '0.0.0.0', () => {
  console.log(' ℹ️  HTTP Redirector active on port ' + HTTP_PORT + ' (Redirecting to HTTPS)');
});
`;

fs.writeFileSync('server.js', serverCode, 'utf8');
console.log('HTTPS compliant server.js written');
