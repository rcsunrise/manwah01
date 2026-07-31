const fs = require('fs');
const content = fs.readFileSync('src/pages/ManwahStudio.tsx', 'utf-8');

let openBraces = 0;
const lines = content.split('\n');
for(let i=1140; i<=1550; i++) {
   const line = lines[i] || '';
   let lineOpens = 0;
   let lineCloses = 0;
   let withinString = false;
   let stringChar = '';
   for(let j=0; j<line.length; j++) {
       const char = line[j];
       if (withinString) {
           if (char === stringChar) {
               if (j > 0 && line[j-1] !== '\\') {
                   withinString = false;
               }
           }
       } else {
           if (char === '"' || char === "'" || char === '`') {
               withinString = true;
               stringChar = char;
           } else if (char === '{') {
               openBraces++;
               lineOpens++;
           } else if (char === '}') {
               openBraces--;
               lineCloses++;
           }
       }
   }
   if (lineOpens !== lineCloses) {
       console.log(`Line ${i+1}: open=${lineOpens}, close=${lineCloses}, total=${openBraces} | ${line.trim()}`);
   }
}
