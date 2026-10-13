import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { createStaticServer, projectRoot } from '../scripts/serve.mjs';
import { PREFERENCE_KEY } from '../tools/password/preferences.js';
import '../scripts/build.mjs';

const output = path.join(projectRoot, 'test-results');
await mkdir(output, { recursive: true });
assert.deepEqual((await readdir(path.join(projectRoot, 'dist'))).sort(), ['.nojekyll', 'assets', 'index.html', 'tools'].sort());
const server = createStaticServer({ root: path.join(projectRoot, 'dist'), base: '/BesTools/' });
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const origin = 'http://127.0.0.1:' + server.address().port;
const home = origin + '/BesTools/';
const passwordUrl = home + 'tools/password/';
const channel = process.env.BES_BROWSER_CHANNEL ?? (process.platform === 'win32' ? 'msedge' : '');
const errors = [];
const badResponses = [];
const externalRequests = [];
let browser;

try {
  browser = await chromium.launch({ headless: true, ...(channel ? { channel } : {}) });
  const context = await browser.newContext({ viewport: { width: 1120, height: 980 }, permissions: ['clipboard-read', 'clipboard-write'] });
  await context.route('**/*', route => {
    if (!route.request().url().startsWith(origin + '/')) { externalRequests.push(route.request().url()); return route.abort(); }
    return route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) badResponses.push(response.url()); });
  await page.goto(home);
  assert.match(await page.title(), /BesTools/);
  assert.equal(await page.locator('.tool-card').count(), 1);
  await page.screenshot({ path: path.join(output, 'home-desktop.png'), fullPage: true });
  await page.locator('.tool-card').click();
  assert.equal(page.url(), passwordUrl);
  await page.reload();
  await page.locator('[type="submit"]:enabled').waitFor();
  const generate = () => page.getByRole('button', { name: /^(生成密码|重新生成)$/ }).click();
  const passwords = () => page.locator('.password-row code').allTextContents();
  assert.deepEqual(await passwords(), []);
  await generate();
  let values = await passwords();
  assert.equal(values.length, 1);
  assert.match(values[0], /^[A-HJ-NP-Za-km-np-z2-9]{16}$/);
  assert.match(values[0], /[A-Z]/); assert.match(values[0], /[a-z]/); assert.match(values[0], /[0-9]/);
  await page.getByRole('button', { name: '复制第 1 个密码', exact: true }).click();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), values[0]);
  await page.screenshot({ path: path.join(output, 'password-desktop.png'), fullPage: true });
  await page.locator('[data-length="10"]').click();
  assert.deepEqual(await passwords(), []);
  assert.equal(await page.locator('#length').inputValue(), '10');
  await page.getByText('高级选项', { exact: false }).click();
  await page.locator('#count').fill('3');
  await page.locator('[name="groups"][value="symbols"]').check();
  await page.locator('#excluded').fill('{}[]');
  await generate();
  values = await passwords();
  assert.equal(values.length, 3);
  for (const value of values) { assert.equal(value.length, 10); assert.match(value, /[^a-zA-Z0-9]/); assert.ok(!/[{}\[\]0Oo1Il]/.test(value)); }
  await page.getByRole('button', { name: '复制全部', exact: true }).click();
  // Windows 剪贴板将行分隔符规范成 CRLF，比较时只统一这一平台差异。
  assert.equal((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n'), values.join('\n'));
  const persisted = await page.evaluate(key => localStorage.getItem(key), PREFERENCE_KEY);
  for (const value of values) assert.ok(!persisted.includes(value));
  await page.reload();
  await page.locator('[type="submit"]:enabled').waitFor();
  assert.deepEqual(await passwords(), []);
  assert.equal(await page.locator('#length').inputValue(), '10');
  assert.equal(await page.locator('#count').inputValue(), '3');
  assert.equal(await page.locator('#excluded').inputValue(), '{}[]');
  await page.locator('#remember').uncheck();
  assert.equal(await page.evaluate(key => localStorage.getItem(key), PREFERENCE_KEY), null);
  await page.reload();
  await page.locator('[type="submit"]:enabled').waitFor();
  assert.equal(await page.locator('#length').inputValue(), '16');

  await page.locator('#length').fill('3'); await generate();
  assert.match(await page.locator('#form-error').innerText(), /长度/);
  assert.deepEqual(await passwords(), []);
  await page.getByRole('button', { name: '恢复默认' }).click();
  for (const input of await page.locator('[name="groups"]').all()) await input.uncheck();
  await generate(); assert.match(await page.locator('#form-error').innerText(), /至少选择/);
  await page.getByRole('button', { name: '恢复默认' }).click();
  await page.locator('.advanced summary').click();
  await page.locator('#excluded').fill('0123456789'); await generate();
  assert.match(await page.locator('#form-error').innerText(), /一整类/);
  await page.getByRole('button', { name: '恢复默认' }).click();
  await generate();
  await page.getByRole('button', { name: '清空结果' }).click();
  assert.equal(await page.locator('[type="submit"]').evaluate(element => element === document.activeElement), true);
  await page.locator('[type="submit"]').press('Enter');
  assert.equal((await passwords()).length, 1);

  await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('Denied'); } } }); });
  await page.getByRole('button', { name: '复制第 1 个密码', exact: true }).click();
  assert.match(await page.locator('#result-status').innerText(), /手动复制/);
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.screenshot({ path: path.join(output, 'password-dark.png'), fullPage: true });

  for (const url of [home, passwordUrl]) {
    await page.goto(url);
    if (url === passwordUrl) { await page.locator('[type="submit"]:enabled').waitFor(); await generate(); await page.locator('.advanced summary').click(); }
    for (const width of [1120, 800, 660, 375, 320]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Overflow at ' + width + ': ' + url);
    }
  }
  await page.emulateMedia({ colorScheme: 'light' });
  await page.screenshot({ path: path.join(output, 'password-mobile.png'), fullPage: true });
  await page.goto(home);
  await page.screenshot({ path: path.join(output, 'home-mobile.png'), fullPage: true });

  const restricted = await browser.newContext();
  await restricted.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('Blocked'); } }); });
  const restrictedPage = await restricted.newPage();
  restrictedPage.on('pageerror', error => errors.push(error.message));
  await restrictedPage.goto(passwordUrl);
  await restrictedPage.locator('[type="submit"]:enabled').waitFor();
  await restrictedPage.locator('[type="submit"]').click();
  assert.equal(await restrictedPage.locator('.password-row').count(), 1);
  await restricted.close();

  const noCrypto = await browser.newContext();
  await noCrypto.addInitScript(() => { Object.defineProperty(window, 'crypto', { value: undefined }); });
  const noCryptoPage = await noCrypto.newPage();
  await noCryptoPage.goto(passwordUrl);
  await noCryptoPage.locator('[type="submit"]:enabled').waitFor();
  await noCryptoPage.locator('[type="submit"]').click();
  assert.match(await noCryptoPage.locator('#form-error').innerText(), /安全随机源/);
  assert.equal(await noCryptoPage.locator('.password-row').count(), 0);
  await noCrypto.close();

  assert.deepEqual(externalRequests, []); assert.deepEqual(badResponses, []); assert.deepEqual(errors, []);
  const report = { basePath: '/BesTools/', secureGeneration: true, batch: true, clipboard: true, preferencesOnly: true, invalidRules: true, restrictedStorage: true, noCryptoFailsClosed: true, widths: [1120, 800, 660, 375, 320], externalRequests, errors, badResponses };
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2).replace(/\n/g, '\r\n') + '\r\n');
  console.log('浏览器验证通过：生成与复制、规则边界、偏好隐私、子路径、窄屏和深浅色。');
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
