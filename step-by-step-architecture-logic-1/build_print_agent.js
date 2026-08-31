const fs = require('fs');

const agentCode = `const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { printFile } = require('./printer.js');

// Set your deployed Vercel domain URL here
const VERCEL_APP_URL = process.env.VERCEL_URL || 'https://your-app.vercel.app';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const POLL_INTERVAL_MS = 5000; // Poll every 5 seconds

console.log('===================================================');
console.log(' 🖨️  LOCAL SHOP PRINTER SYNC AGENT ACTIVE');
console.log(' 🌐 Connected Cloud URL: ' + VERCEL_APP_URL);
console.log(' 🔄 Checking for paid print orders every 5 seconds...');
console.log('===================================================');

const printedOrderIds = new Set();

async function pollPaidOrders() {
  try {
    const client = VERCEL_APP_URL.startsWith('https') ? https : http;
    const reqUrl = VERCEL_APP_URL + '/api/dashboard';

    client.get(reqUrl, {
      headers: {
        'Authorization': 'Bearer ' + ADMIN_TOKEN,
        'Content-Type': 'application/json'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', async () => {
        try {
          const json = JSON.parse(data);
          if (json.success && json.stats && json.stats.recent_orders) {
            const pendingPrintOrders = json.stats.recent_orders.filter(
              o => (o.payment_status === 'success' || o.payment_status === 'completed') &&
                   !printedOrderIds.has(o.id)
            );

            for (const order of pendingPrintOrders) {
              console.log('⚡ New Live Paid Order Detected:', order.id, 'File:', order.original_name);
              printedOrderIds.add(order.id);

              // Execute local physical print command
              const result = await printFile(order.file_path, {
                copies: order.copies,
                colorMode: order.color_mode
              });
              console.log('✅ Printed successfully on Shop Printer:', result.message);
            }
          }
        } catch (e) {}
      });
    }).on('error', () => {});
  } catch (err) {}
}

setInterval(pollPaidOrders, POLL_INTERVAL_MS);
pollPaidOrders();
`;

fs.writeFileSync('print-agent.js', agentCode, 'utf8');
if (fs.existsSync('github_project')) {
  fs.writeFileSync('github_project/print-agent.js', agentCode, 'utf8');
}
if (fs.existsSync('local_main_files')) {
  fs.writeFileSync('local_main_files/print-agent.js', agentCode, 'utf8');
}
console.log('print-agent.js created successfully');
