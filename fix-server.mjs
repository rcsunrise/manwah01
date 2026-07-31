import fs from 'fs';

let content = fs.readFileSync('server.ts', 'utf-8');
content = content.replace(/, supabase \} from '.\/src\/lib\/supabase';/, '} from \'./src/lib/supabase\';');
content = content.replace(/\/\/ Resolution multipliers[\s\S]*?\};\n/, '');
content = content.replace(/\s+\/\/ Helper to match the closest supported aspect ratio[\s\S]*?return '1:1';\n\s+\}\n\s+\};\n/, '');

fs.writeFileSync('server.ts', content);
