const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { printFile } = require('./printer.js');

// Config: Set your live Vercel URL and Admin Token
const VERCEL_APP_URL = process.env.VERCEL_URL || 'https://your-app.vercel.app';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const POLL_INTERVAL_MS = 3000; // Check every 3 seconds

console.log('===================================================');
console.log(' 🖨️  AUTOMATIC PRINT AGENT INITIALIZED');
console.log(' 🔒 Policy: PRINT ONLY AFTER SUCCESSFUL PAYMENT VERIFICATION');
console.log(' 🌐 Connected Server: ' + VERCEL_APP_URL);
console.log('===================================================');

const processedOrders = new Set();

function fetchJson(endpoint) {
  return new Promise((resolve, reject) => {
    const isHttps = VERCEL_APP_URL.startsWith('https');
    const client = isHttps ? https : http;
    const reqUrl = VERCEL_APP_URL + endpoint;

    const req = client.get(reqUrl, {
      headers: {
        'Authorization': 'Bearer ' + ADMIN_TOKEN,
        'Content-Type': 'application/json'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(null);
        }
      });
    });
    req.on('error', reject);
  });
}

async function checkAndPrintPaidOrders() {
  try {
    const data = await fetchJson('/api/dashboard');
    if (data && data.success && data.stats && data.stats.recent_orders) {
      const paidOrders = data.stats.recent_orders.filter(order => {
        // STRICT RULE: Only print if payment_status is 'success' or 'completed'
        const isPaid = order.payment_status === 'success' || order.payment_status === 'completed';
        const notYetPrinted = !processedOrders.has(order.id) && order.print_status !== 'completed';
        return isPaid && notYetPrinted;
      });

      for (const order of paidOrders) {
        console.log('\n[PAYMENT VERIFIED] Order ID:', order.id);
        console.log('📄 Document:', order.original_name);
        console.log('💰 Amount Paid: ₹' + order.total_amount);
        console.log('🖨️  Mode:', order.color_mode.toUpperCase(), '| Copies:', order.copies, '| Pages:', order.page_count);

        processedOrders.add(order.id);

        // Initiate Physical Printer Command
        console.log('🚀 Triggering Automatic Printout on Shop Printer...');
        const printResult = await printFile(order.file_path, {
          copies: order.copies,
          colorMode: order.color_mode
        });

        console.log('✅ PRINT COMPLETED:', printResult.message);
      }
    }
  } catch (err) {
    // Silent fail retry on next interval
  }
}

setInterval(checkAndPrintPaidOrders, POLL_INTERVAL_MS);
checkAndPrintPaidOrders();
