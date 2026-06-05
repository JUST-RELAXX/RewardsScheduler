const fs = require('fs');
let c = fs.readFileSync('e:/2026 STUFFS/RewardsScheduler/renderer/extension-logic.js', 'utf8');
c = c.replace(/\\`/g, '`');
c = c.replace(/\\\$\{/g, '${');
fs.writeFileSync('e:/2026 STUFFS/RewardsScheduler/renderer/extension-logic.js', c);
