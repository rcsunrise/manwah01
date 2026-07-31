import fs from 'fs';

let content = fs.readFileSync('src/services/geminiService.ts', 'utf-8');
content = content.replace(/const promptText = `[\s\S]*?`;\n\n/g, '');
fs.writeFileSync('src/services/geminiService.ts', content);

