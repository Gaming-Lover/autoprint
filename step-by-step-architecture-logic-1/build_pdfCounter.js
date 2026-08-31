const fs = require("fs");
const code = `const fs = require("fs");
const path = require("path");

function getPdfPageCount(filePath) {
  try {
    const ext = path.extname(filePath).toLowerCase();
    if ([".jpg", ".jpeg", ".png", ".bmp", ".webp"].includes(ext)) {
      return 1;
    }
    
    if (ext === ".pdf") {
      const buffer = fs.readFileSync(filePath);
      const text = buffer.toString("binary");
      
      // Strategy 1: Look for /Count N in Catalog
      const countMatch = text.match(/\\/Count\\s+(\\d+)/);
      if (countMatch && countMatch[1]) {
        const count = parseInt(countMatch[1], 10);
        if (count > 0 && count < 10000) return count;
      }
      
      // Strategy 2: Count occurrences of /Type /Page (excluding /Pages)
      const pageMatches = text.match(/\\/Type\\s*\\/Page\\b(?!s)/g);
      if (pageMatches && pageMatches.length > 0) {
        return pageMatches.length;
      }
    }
    return 1;
  } catch (err) {
    console.error("Error reading file for page count:", err);
    return 1;
  }
}

module.exports = { getPdfPageCount };
`;
fs.writeFileSync("pdfCounter.js", code, "utf8");

