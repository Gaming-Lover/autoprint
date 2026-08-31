const fs = require('fs');
const path = require('path');

const vercelDir = path.join(__dirname, 'vercel_customer_frontend');
const pcBackendDir = path.join(__dirname, 'shop_pc_backend');

if (!fs.existsSync(vercelDir)) fs.mkdirSync(vercelDir, { recursive: true });
if (!fs.existsSync(pcBackendDir)) fs.mkdirSync(pcBackendDir, { recursive: true });

// 1. Build Vercel Customer Frontend Folder
const vercelPublic = path.join(vercelDir, 'public');
const vercelCss = path.join(vercelPublic, 'css');
const vercelJs = path.join(vercelPublic, 'js');
fs.mkdirSync(vercelCss, { recursive: true });
fs.mkdirSync(vercelJs, { recursive: true });

fs.copyFileSync(path.join(__dirname, 'public', 'index.html'), path.join(vercelPublic, 'index.html'));
fs.copyFileSync(path.join(__dirname, 'public', 'success.html'), path.join(vercelPublic, 'success.html'));
fs.copyFileSync(path.join(__dirname, 'public', 'css', 'style.css'), path.join(vercelCss, 'style.css'));
fs.copyFileSync(path.join(__dirname, 'public', 'js', 'customer.js'), path.join(vercelJs, 'customer.js'));

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
fs.writeFileSync(path.join(vercelDir, '.gitignore'), "node_modules\n.vercel\n.appdata\n.tmp\n", 'utf8');
fs.writeFileSync(path.join(vercelDir, 'package.json'), JSON.stringify({
  "name": "print-shop-customer-frontend",
  "version": "1.0.0"
}, null, 2), 'utf8');

// 2. Build Shop PC Backend Folder
const copyFiles = [
  'server.js', 'db.js', 'db.json', 'pdfCounter.js', 'razorpay.js',
  'printer.js', 'generateCert.js', 'print-agent.js', 'package.json'
];

copyFiles.forEach(file => {
  if (fs.existsSync(file)) {
    fs.copyFileSync(file, path.join(pcBackendDir, file));
  }
});

// Copy public directory to shop_pc_backend
const pcPublic = path.join(pcBackendDir, 'public');
const pcCss = path.join(pcPublic, 'css');
const pcJs = path.join(pcPublic, 'js');
fs.mkdirSync(pcCss, { recursive: true });
fs.mkdirSync(pcJs, { recursive: true });

fs.readdirSync('public').forEach(item => {
  const srcItem = path.join('public', item);
  if (fs.statSync(srcItem).isFile()) {
    fs.copyFileSync(srcItem, path.join(pcPublic, item));
  }
});
fs.readdirSync('public/css').forEach(item => {
  fs.copyFileSync(path.join('public/css', item), path.join(pcCss, item));
});
fs.readdirSync('public/js').forEach(item => {
  fs.copyFileSync(path.join('public/js', item), path.join(pcJs, item));
});

console.log('Clean split completed successfully!');
