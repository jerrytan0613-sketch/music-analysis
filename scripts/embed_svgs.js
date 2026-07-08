const fs = require('fs');
const path = require('path');

const htmlPath = 'C:/Users/LinXuan/Desktop/music-analysis/report/report.html';
const figuresDir = 'C:/Users/LinXuan/Desktop/music-analysis/report/figures';

let html = fs.readFileSync(htmlPath, 'utf-8');
let replaced = 0;

html = html.replace(/src="figures\/(v\d+_\w+\.svg)"/g, (match, filename) => {
  const svgPath = path.join(figuresDir, filename);
  if (fs.existsSync(svgPath)) {
    const svgContent = fs.readFileSync(svgPath, 'utf-8');
    const base64 = Buffer.from(svgContent, 'utf-8').toString('base64');
    replaced++;
    return 'src="data:image/svg+xml;base64,' + base64 + '"';
  }
  console.error('Missing:', filename);
  return match;
});

fs.writeFileSync(htmlPath, html, 'utf-8');
console.log('Replaced ' + replaced + ' SVG references with inline base64');
