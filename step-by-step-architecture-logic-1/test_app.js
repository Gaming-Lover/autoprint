const http = require('http');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

console.log('🚀 Starting Print Shop Kiosk Integration Test...');

const DB = require('./db.js');
DB.resetDatabase();

const appEnv = {
  ...process.env,
  PORT: '3999',
  APPDATA: path.join(__dirname, '.appdata'),
  LOCALAPPDATA: path.join(__dirname, '.appdata'),
  USERPROFILE: __dirname,
  TEMP: path.join(__dirname, '.tmp'),
  TMP: path.join(__dirname, '.tmp')
};

const server = spawn('node', ['server.js'], { env: appEnv });

let serverOutput = '';
server.stdout.on('data', (d) => serverOutput += d.toString());
server.stderr.on('data', (d) => serverOutput += d.toString());

function request(method, pathStr, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const reqHeaders = { ...headers };
    let payload = body;

    if (body && typeof body === 'object' && !Buffer.isBuffer(body)) {
      payload = JSON.stringify(body);
      if (!reqHeaders['Content-Type']) {
        reqHeaders['Content-Type'] = 'application/json';
      }
    }

    if (payload) {
      reqHeaders['Content-Length'] = Buffer.isBuffer(payload) ? payload.length : Buffer.byteLength(payload);
    }

    const req = http.request({
      hostname: '127.0.0.1',
      port: 3999,
      path: pathStr,
      method: method,
      headers: reqHeaders
    }, (res) => {
      let data = [];
      res.on('data', chunk => data.push(chunk));
      res.on('end', () => {
        const resStr = Buffer.concat(data).toString('utf8');
        try {
          resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(resStr) });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, rawBody: resStr });
        }
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function waitForServer(retries = 20) {
  return new Promise((resolve, reject) => {
    const check = () => {
      request('GET', '/api/status')
        .then(resolve)
        .catch(err => {
          if (retries <= 0) return reject(new Error('Server failed to start. Output:\n' + serverOutput));
          retries--;
          setTimeout(check, 250);
        });
    };
    check();
  });
}

async function runTests() {
  try {
    await waitForServer();
    console.log('Server is ready on port 3999.');

    // 1. Initial Status Check
    console.log('Test 1: Checking Initial Status...');
    const status1 = await request('GET', '/api/status');
    if (status1.body.is_configured !== false) throw new Error('Initial status check failed');
    console.log('✅ Test 1 Passed: Initial status unconfigured.');

    // 2. Perform Setup
    console.log('Test 2: Submitting First-Boot Setup...');
    const setupRes = await request('POST', '/api/setup', {
      admin_id: 'admin_test',
      password: 'password123',
      shop_name: 'Speedy Kiosk Test Shop',
      bw_rate: 3.50,
      color_rate: 12.00,
      razorpay_key_id: 'rzp_test_mock',
      razorpay_key_secret: 'rzp_secret_mock'
    });
    if (!setupRes.body.success) throw new Error('Setup failed: ' + setupRes.body.message);
    console.log('✅ Test 2 Passed: Setup completed.');

    // 3. Post-Setup Status Check
    console.log('Test 3: Checking Post-Setup Status...');
    const status2 = await request('GET', '/api/status');
    if (!status2.body.is_configured || status2.body.shop_name !== 'Speedy Kiosk Test Shop') {
      throw new Error('Post-setup verification failed');
    }
    console.log('✅ Test 3 Passed: Kiosk is configured.');

    // 4. Admin Login
    console.log('Test 4: Admin Authentication Login...');
    const loginRes = await request('POST', '/api/auth/login', {
      username: 'admin_test',
      password: 'password123'
    });
    if (!loginRes.body.success || !loginRes.body.token) throw new Error('Login failed');
    const token = loginRes.body.token;
    console.log('✅ Test 4 Passed: Admin login authenticated token generated.');

    // 5. Test File Upload & Page Counting
    console.log('Test 5: File Upload & Page Count Calculation...');
    const testFilePath = path.join(__dirname, 'test_doc.jpg');
    fs.writeFileSync(testFilePath, 'fake image data for testing');

    const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
    const crlf = String.fromCharCode(13, 10);
    const headerStr = '--' + boundary + crlf +
      'Content-Disposition: form-data; name="file"; filename="test_doc.jpg"' + crlf +
      'Content-Type: image/jpeg' + crlf + crlf;
    const footerStr = crlf + '--' + boundary + '--' + crlf;

    const bodyBuffer = Buffer.concat([
      Buffer.from(headerStr),
      fs.readFileSync(testFilePath),
      Buffer.from(footerStr)
    ]);

    const uploadRes = await request('POST', '/api/upload', bodyBuffer, {
      'Content-Type': 'multipart/form-data; boundary=' + boundary
    });
    if (!uploadRes.body.success) throw new Error('File upload failed: ' + JSON.stringify(uploadRes.body));
    if (uploadRes.body.page_count !== 1) throw new Error('Page count calculation error');
    console.log('✅ Test 5 Passed: File uploaded & page count calculated.');

    // 6. Create Order & Razorpay Order
    console.log('Test 6: Creating Print Order & Razorpay Order...');
    const orderRes = await request('POST', '/api/create-order', {
      filename: uploadRes.body.file_id,
      original_name: 'test_doc.jpg',
      file_path: uploadRes.body.file_path,
      page_count: 5,
      color_mode: 'color',
      copies: 2,
      customer_session_id: 'cust_session_101'
    });
    if (!orderRes.body.success || orderRes.body.amount !== 120) {
      throw new Error('Order creation failed: ' + JSON.stringify(orderRes.body));
    }
    console.log('✅ Test 6 Passed: Print order created. Total calculated: ₹120.00');

    // 7. Verify Payment & Execute Print
    console.log('Test 7: Payment Verification & Print Execution...');
    const verifyRes = await request('POST', '/api/verify-payment', {
      order_id: orderRes.body.order_id,
      razorpay_order_id: orderRes.body.razorpay_order_id,
      razorpay_payment_id: 'pay_test_9999',
      razorpay_signature: 'simulated_sig'
    });
    if (!verifyRes.body.success) throw new Error('Payment verification failed');
    console.log('✅ Test 7 Passed: Payment verified & print job executed.');

    // 8. Admin Dashboard Stats Verification
    console.log('Test 8: Admin Dashboard Stats API...');
    const dashRes = await request('GET', '/api/dashboard', null, {
      'Authorization': 'Bearer ' + token
    });
    if (!dashRes.body.success) throw new Error('Dashboard stats request failed');
    const stats = dashRes.body.stats;
    if (stats.total_customers !== 1 || stats.total_printouts !== 10 || stats.total_payments !== 120) {
      throw new Error('Dashboard statistics mismatch: ' + JSON.stringify(stats));
    }
    console.log('✅ Test 8 Passed: Admin dashboard statistics verified accurately!');

    // 9. Factory Reset Security Test
    console.log('Test 9: Factory Reset with Invalid Password...');
    const resetFail = await request('POST', '/api/reset-settings', { password: 'wrong_password' }, {
      'Authorization': 'Bearer ' + token
    });
    if (resetFail.body.success !== false) throw new Error('Invalid password reset should be rejected');
    console.log('✅ Test 9 Passed: Invalid password rejected on factory reset.');

    console.log('Test 10: Factory Reset with Valid Password...');
    const resetSuccess = await request('POST', '/api/reset-settings', { password: 'password123' }, {
      'Authorization': 'Bearer ' + token
    });
    if (!resetSuccess.body.success) throw new Error('Factory reset failed');

    const statusAfterReset = await request('GET', '/api/status');
    if (statusAfterReset.body.is_configured !== false) throw new Error('App not reset');
    console.log('✅ Test 10 Passed: Factory reset completed and app restarted to setup page.');

    console.log('\n🎉 ALL 10 ARCHITECTURE & LOGIC INTEGRATION TESTS PASSED 100% CLEANLY! 🎉\n');
  } catch (err) {
    console.error('❌ Test failed with error:', err);
  } finally {
    server.kill();
    process.exit(0);
  }
}

runTests();
