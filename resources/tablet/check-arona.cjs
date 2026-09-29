const { chromium } = require('playwright-core');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.skel': 'application/octet-stream', '.atlas': 'text/plain', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => { if (err) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }); res.end(data); });
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true });
  const page = await browser.newPage({ viewport: { width: 1100, height: 680 } });
  await page.route('**/index.html', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>' }));
  page.on('pageerror', error => console.error('page error', error.stack));
  page.on('console', async message => { if (['error','log'].includes(message.type())) console.error('console', ...(await Promise.all(message.args().map(arg => arg.jsonValue().catch(() => arg.toString())))), message.location()); });
  page.on('requestfailed', req => console.error('failed request', req.url(), req.failure()));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    const { mountArona } = await import('/resources/tablet/arona-bundle.js');
    const canvas = document.createElement('canvas');
    canvas.id = 'test-spine-canvas';
    canvas.style.cssText = 'position:fixed;inset:0;width:500px;height:560px;z-index:9999';
    document.body.append(canvas);
    mountArona(canvas);
  });
  await page.waitForTimeout(2800);
  console.log('canvas rect', await page.locator('#test-spine-canvas').evaluate(c => { const r = c.getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width, height:r.height, display: getComputedStyle(c).display, visibility: getComputedStyle(c).visibility }; }));
  console.log('page url',page.url());
  console.log('canvas count', await page.locator('canvas').count());
  console.log('render diagnostics', await page.evaluate(() => { const canvas=document.getElementById('test-spine-canvas'); const context=canvas.getContext('2d'); return { width: canvas.width, height:canvas.height, size:canvas.getBoundingClientRect().toJSON(), image:canvas.toDataURL().length }; }));
  const result = await page.evaluate(() => {
    const canvas = document.getElementById('test-spine-canvas');
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let nontransparent = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) nontransparent++;
    return { width: canvas.width, height: canvas.height, nontransparent };
  });
  console.log('arona render result', result);
  await browser.close();
  server.close();
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
