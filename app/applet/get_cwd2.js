import fs from 'fs'; console.log(process.cwd(), fs.readdirSync('.').filter(f => f.includes('server.ts')));
