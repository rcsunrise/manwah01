import fs from 'fs';
let content = fs.readFileSync('src/components/BalanceDisplay.tsx', 'utf-8');
content = content.replace(/import \{ Coins, HardDrive, DollarSign \} from 'lucide-react';\n/, '');
fs.writeFileSync('src/components/BalanceDisplay.tsx', content);

content = fs.readFileSync('src/pages/Dashboard.tsx', 'utf-8');
content = content.replace(/import \{.*?\} from 'lucide-react';/, (match) => {
    return match.replace(/Activity, |LogOut, /, '').replace(/, Activity/, '').replace(/, LogOut/, '');
});
fs.writeFileSync('src/pages/Dashboard.tsx', content);

content = fs.readFileSync('src/pages/AdminUsers.tsx', 'utf-8');
content = content.replace(/import \{.*?\} from 'lucide-react';/, (match) => {
    return match.replace(/Users, |UserPlus, |Shield, /, '').replace(/, Users/, '').replace(/, UserPlus/, '').replace(/, Shield/, '');
});
fs.writeFileSync('src/pages/AdminUsers.tsx', content);
