const fs = require('fs');
const content = fs.readFileSync('src/pages/ManwahStudio.tsx', 'utf-8');
const lines = content.split('\n');

let depth = 0;
let lineNum = 1;

for (const line of lines) {
  // Very rough regex for opening and closing divs. Will count self-closing as open, but a div is rarely self closing.
  const opens = (line.match(/<div(?:\s|>)/g) || []).length;
  const closes = (line.match(/<\/div>/g) || []).length;
  
  if (lineNum >= 1146 && lineNum <= 1550) {
      if (lineNum === 1146) {
          console.log(`Starting block at 1146. Initial depth 0.`);
          depth = 0;
      }
      depth += opens;
      depth -= closes;
      console.log(`Line ${lineNum}: opens=${opens}, closes=${closes}, depth=${depth} | ${line.trim()}`);
  }
  lineNum++;
}
