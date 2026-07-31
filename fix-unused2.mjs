import fs from 'fs';

function removeImports(filePath, regex) {
  let content = fs.readFileSync(filePath, 'utf-8');
  content = content.replace(regex, (match) => {
    return match.replace(/Settings2, |Plus, |Database, |Square, |X, |Sparkles, /, '').replace(/, Settings2/, '').replace(/, Plus/, '').replace(/, Database/, '').replace(/, Square/, '').replace(/, X/, '').replace(/, Sparkles/, '');
  });
  fs.writeFileSync(filePath, content);
}

removeImports('src/pages/ManwahStudio.tsx', /import \{.*?\} from 'lucide-react';/g);
removeImports('src/components/AEPPanelNew.tsx', /import \{.*?\} from 'lucide-react';/g);
removeImports('src/components/Layout.tsx', /import \{.*?\} from 'lucide-react';/g);
