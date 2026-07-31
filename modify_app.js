const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace("import AdminUsers from './pages/AdminUsers';", "import AdminUsers from './pages/AdminUsers';\nimport AdminDashboard from './pages/AdminDashboard';");

const target = "        <Route \n          path=\"/admin/users\"";
const replacement = "        <Route \n          path=\"/admin/dashboard\" \n          element={\n            <RequireAuth>\n              <AdminDashboard />\n            </RequireAuth>\n          } \n        />\n" + target;

code = code.replace(target, replacement);

fs.writeFileSync('src/App.tsx', code);
console.log('Modified src/App.tsx');