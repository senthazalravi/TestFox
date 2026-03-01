const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

(async () => {
  try {
    const workspaceRoot = process.cwd();
    const folder = path.join(workspaceRoot, '.testfox');
    if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });

    const collection = {
      info: {
        name: 'Sample-TestFox-Collection',
        schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
      },
      item: [
        {
          name: 'GET Echo',
          request: {
            method: 'GET',
            header: [],
            url: {
              raw: 'https://postman-echo.com/get?foo1=bar1',
              host: ['https://postman-echo.com'],
              path: ['get'],
              query: [{ key: 'foo1', value: 'bar1' }]
            }
          }
        }
      ]
    };

    const collectionPath = path.join(folder, 'postman_collection.json');
    fs.writeFileSync(collectionPath, JSON.stringify(collection, null, 2), 'utf8');
    console.log('Wrote sample collection to', collectionPath);

    const reportTmp = path.join(folder, 'postman_newman_results.json');

    function run(cmd, opts = {}) {
      return new Promise((resolve, reject) => {
        exec(cmd, { ...opts, maxBuffer: 1024 * 1024 * 10 }, (err, stdout, stderr) => {
          if (err) return reject({ err, stdout, stderr });
          resolve({ stdout, stderr });
        });
      });
    }

    // Check npx newman
    let newmanAvailable = true;
    try {
      await run('npx newman --version');
      console.log('Newman available via npx');
    } catch (e) {
      console.log('Newman not available via npx, installing locally...');
      newmanAvailable = false;
    }

    if (!newmanAvailable) {
      try {
        await run('npm install newman --no-audit --no-fund --silent');
        console.log('Newman installed locally');
      } catch (ie) {
        console.error('Failed to install newman:', ie.stderr || ie);
        process.exit(1);
      }
    }

    const cmd = `npx newman run "${collectionPath}" --reporters json --reporter-json-export "${reportTmp}"`;
    console.log('Running:', cmd);

    try {
      const res = await run(cmd);
      console.log('Newman run completed');
    } catch (runErr) {
      console.error('Newman run failed:', runErr.stderr || runErr);
      process.exit(1);
    }

    if (fs.existsSync(reportTmp)) {
      const raw = fs.readFileSync(reportTmp, 'utf8');
      const parsed = JSON.parse(raw);
      const reportPath = path.join(folder, 'postman_report.json');
      const report = { generatedAt: new Date().toISOString(), collectionInfo: collection.info, results: parsed };
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
      console.log('Postman report written to', reportPath);
    } else {
      console.error('Expected Newman report at', reportTmp, 'but it was not created');
      process.exit(1);
    }
  } catch (err) {
    console.error('Error in sample_postman_run:', err);
    process.exit(1);
  }
})();
