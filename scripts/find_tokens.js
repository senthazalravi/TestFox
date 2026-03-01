const fs = require('fs');
const paths = [
  'C:\\Users\\ravia\\.env',
  'C:\\Users\\ravia\\.env.local',
  'C:\\Users\\ravia\\TestFox\\.env',
  'C:\\Users\\ravia\\TestFox\\.env.local',
  'C:\\Users\\ravia\\.envrc',
  'C:\\Users\\ravia\\.bashrc',
  'C:\\Users\\ravia\\.profile'
];
let found = false;
for (const p of paths) {
  try {
    if (fs.existsSync(p)) {
      const c = fs.readFileSync(p, 'utf8');
      if (/VSCE_TOKEN|OPENVSX_TOKEN/.test(c)) {
        console.log(p + ':');
        c.split(/\r?\n/).forEach(l => {
          if (/VSCE_TOKEN|OPENVSX_TOKEN/.test(l)) console.log('  ' + l);
        });
        found = true;
      } else {
        console.log(p + ': FOUND but no tokens');
      }
    }
  } catch (e) {
    // ignore
  }
}
if (!found) process.exit(0);
