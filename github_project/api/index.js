const url = require('url');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DB = require('../db.js');
const { getPdfPageCount } = require('../pdfCounter.js');
const { createRazorpayOrder, verifySignature } = require('../razorpay.js');
const { printFile } = require('../printer.js');

const uploadsDir = process.env.VERCEL ? '/tmp/uploads' : path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

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
  return new Promise((resolve) => {
    if (req.body && typeof req.body === 'object') return resolve(req.body);
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        resolve({});
      }
    });
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
        if (buffer[headerStart] === 13 && buffer[headerStart + 1] === 10) headerStart += 2;
        else if (buffer[headerStart] === 10) headerStart += 1;

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
        if (buffer[contentEnd - 2] === 13 && buffer[contentEnd - 1] === 10) contentEnd -= 2;
        else if (buffer[contentEnd - 1] === 10) contentEnd -= 1;

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
  });
}

function sendJson(res, statusCode, data) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.statusCode = statusCode;
  res.end(JSON.stringify(data));
}

module.exports = async function handler(req, res) {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname || '';
  const isConfigured = DB.isConfigured();

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.statusCode = 204;
    return res.end();
  }

  if (pathname.includes('status')) {
    const settings = DB.getSettings();
    return sendJson(res, 200, {
      is_configured: isConfigured,
      shop_name: settings.shop_name,
      bw_rate: settings.bw_rate,
      color_rate: settings.color_rate,
      razorpay_key_id: settings.razorpay_key_id
    });
  }

  if (pathname.includes('setup')) {
    if (isConfigured) return sendJson(res, 400, { success: false, message: 'App is already configured.' });
    const body = await parseJsonBody(req);
    if (!body.admin_id || !body.password) return sendJson(res, 400, { success: false, message: 'Admin ID and Password required.' });
    DB.setupInitial(body);
    return sendJson(res, 200, { success: true, message: 'Setup completed successfully!' });
  }

  if (pathname.includes('login')) {
    const body = await parseJsonBody(req);
    const isValid = DB.authenticateUser(body.username, body.password);
    if (!isValid) return sendJson(res, 401, { success: false, message: 'Invalid Admin credentials.' });
    const token = 'token_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    activeSessions.add(token);
    return sendJson(res, 200, { success: true, token, username: body.username });
  }

  if (pathname.includes('dashboard')) {
    if (!checkAdminAuth(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
    return sendJson(res, 200, { success: true, stats: DB.getDashboardStats() });
  }

  if (pathname.includes('settings')) {
    if (!checkAdminAuth(req)) return sendJson(res, 401, { success: false, message: 'Unauthorized' });
    if (req.method === 'GET') return sendJson(res, 200, { success: true, settings: DB.getSettings() });
    const body = await parseJsonBody(req);
    return sendJson(res, 200, { success: true, settings: DB.updateSettings(body) });
  }

  if (pathname.includes('upload')) {
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

  if (pathname.includes('create-order')) {
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

  if (pathname.includes('verify-payment')) {
    const body = await parseJsonBody(req);
    const order = DB.getOrder(body.order_id || body.razorpay_order_id);
    if (!order) return sendJson(res, 404, { success: false, message: 'Order not found.' });

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
    const printResult = await printFile(order.file_path, { copies: order.copies, colorMode: order.color_mode });
    DB.updateOrderPrintStatus(order.id, printResult.status);

    return sendJson(res, 200, {
      success: true,
      message: 'Payment verified and print job initiated!',
      print_status: printResult.status,
      order_id: order.id
    });
  }

  return sendJson(res, 404, { success: false, message: 'API Endpoint not found' });
};
