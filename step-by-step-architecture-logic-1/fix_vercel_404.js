const fs = require('fs');
const path = require('path');

// Clean, modern vercel.json with rewrites
const cleanVercelJson = {
  "rewrites": [
    {
      "source": "/api/(.*)",
      "destination": "/api/index.js"
    }
  ]
};

const vercelStr = JSON.stringify(cleanVercelJson, null, 2);

// Write to root, github_project, and local_main_files
fs.writeFileSync('vercel.json', vercelStr, 'utf8');
if (fs.existsSync('github_project')) {
  fs.writeFileSync(path.join('github_project', 'vercel.json'), vercelStr, 'utf8');
}
if (fs.existsSync('local_main_files')) {
  fs.writeFileSync(path.join('local_main_files', 'vercel.json'), vercelStr, 'utf8');
}

console.log('vercel.json updated with modern rewrites');
