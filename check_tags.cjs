const fs = require('fs');
const content = fs.readFileSync('src/pages/ManwahStudio.tsx', 'utf-8');
const lines = content.split('\n');

const stack = [];
for (let i = 1146; i <= 1548; i++) {
   const line = lines[i];
   if(!line) continue;
   let j = 0;
   while(j < line.length) {
       if (line[j] === '<' && line[j+1] !== '/' && line[j+1] !== ' ' && line[j+1] !== '=') {
          // find tag name
          const match = line.slice(j+1).match(/^([a-zA-Z0-9]+)/);
          if (match) {
             const tag = match[1];
             // let's check if it's self-closing
             const end = line.indexOf('>', j);
             if (end !== -1 && line[end-1] !== '/') {
                 // not self closing
                 if (['input', 'img', 'br', 'hr', 'path', 'svg', 'Loader2', 'Wand2', 'Sparkles', 'ChevronDown', 'Lightbulb', 'Save', 'Languages'].indexOf(tag) === -1) {
                     stack.push({tag, line: i+1});
                 }
             }
          }
       } else if (line[j] === '<' && line[j+1] === '/') {
          const match = line.slice(j+2).match(/^([a-zA-Z0-9]+)/);
          if (match) {
              const tag = match[1];
              if (stack.length > 0 && stack[stack.length-1].tag === tag) {
                  stack.pop();
              } else {
                  console.log('Mismatch closing: ', tag, ' at line ', i+1, ' expected ', stack.length > 0 ? stack[stack.length-1].tag : 'none');
              }
          }
       }
       j++;
   }
}

console.log("Remaining stack:");
console.log(stack);
