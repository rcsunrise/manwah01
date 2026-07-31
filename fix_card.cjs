const fs = require('fs');
const path = 'src/pages/ManwahStudio.tsx';
let data = fs.readFileSync(path, 'utf8');
data = data.replace(/className="sidebar-section premium-shadow"/g, 'className="mhyf-outer-card flex flex-col gap-4"');
fs.writeFileSync(path, data, 'utf8');
