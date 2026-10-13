import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

// 固定原图摘要，使构建或后续改动中的裁切、替换能被验证发现。
const originalHashes = {
  wechat: 'a89ad9f33ecc5b9bc6a6bf5587fa16cd04809d3bfbcaac58a0731faceae41449',
  alipay: '5f5722d5a30ecbd5d51684a2051eb40961070c8954a2f3b3eef403f526f367d4'
};

export async function verifySupport(page, { output, prefix }) {
  const viewport = page.viewportSize();
  const trigger = page.locator('[data-open-support]');
  const dialog = page.locator('#support-dialog');
  const image = dialog.locator('[data-support-image]');
  const passwords = await page.locator('.password-row code').allTextContents();
  const toolState = await page.locator('#password-form').count() ? await page.locator('#password-form').evaluate(form => [...form.querySelectorAll('input')].map(input => [input.id || input.value, input.value, input.checked])) : null;
  const preferences = await page.evaluate(() => localStorage.getItem('bestools.password.preferences.v1'));
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  await trigger.locator(':scope:enabled').waitFor();
  assert.equal(await dialog.isVisible(), false, 'Support must not open automatically');
  assert.equal(await image.getAttribute('src'), null, 'Payment image is loaded only on request');

  await trigger.click();
  assert.equal(await dialog.isVisible(), true);
  assert.equal(await dialog.locator('#support-description').isVisible(), true);
  assert.match(await dialog.locator('#support-description').innerText(), /开源（查看 GitHub 源代码 ↗）、免费/);
  const sourceLink = dialog.locator('.support-source-link');
  assert.equal(await sourceLink.getAttribute('href'), 'https://github.com/BensonLaur/BesTools');
  assert.equal(await sourceLink.getAttribute('target'), '_blank');
  assert.match(await sourceLink.getAttribute('rel'), /noopener/);
  assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
  await dialog.locator(':scope[data-state="open"]').waitFor();
  await page.keyboard.press('Shift+Tab');
  assert.equal(await dialog.evaluate(element => element.contains(document.activeElement)), true, 'Focus stays inside the dialog');
  await page.keyboard.press('Tab');
  assert.equal(await dialog.evaluate(element => element.contains(document.activeElement)), true);

  for (const method of ['wechat', 'alipay']) {
    await dialog.locator(`[data-support-method="${method}"]`).click();
    await page.waitForFunction(() => {
      const picture = document.querySelector('[data-support-image]');
      return picture.complete && picture.naturalWidth > 0;
    });
    assert.equal(await dialog.locator(`[data-support-method="${method}"]`).getAttribute('aria-pressed'), 'true');
    assert.ok((await image.getAttribute('src')).endsWith('/BesTools/assets/support/' + method + '.png'));
    assert.match(await dialog.locator('.support-payee').innerText(), method === 'wechat' ? /Benson\(\*\*城\)/ : /Bes软件/);
    assert.equal(await dialog.locator('[data-support-save]').getAttribute('download'), 'BesTools-' + method + '.png');
    assert.equal(await dialog.locator('[data-support-save]').getAttribute('href'), await dialog.locator('[data-support-original]').getAttribute('href'));
    assert.ok(await image.evaluate(picture => {
      const bounds = picture.getBoundingClientRect();
      return Math.abs(bounds.width / bounds.height - picture.naturalWidth / picture.naturalHeight) < .01;
    }), 'Entire original image retains its aspect ratio');
    const downloaded = page.waitForEvent('download');
    await dialog.locator('[data-support-save]').click();
    const download = await downloaded;
    const savedPath = path.join(output, prefix + '-' + method + '-original.png');
    await download.saveAs(savedPath);
    assert.equal(createHash('sha256').update(await readFile(savedPath)).digest('hex'), originalHashes[method]);
    await page.screenshot({ path: path.join(output, prefix + '-support-' + method + '-desktop.png') });
  }
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
  assert.equal(await trigger.evaluate(button => document.activeElement === button), true);

  // 动画中途关闭再打开，旧任务不得使新面板消失。
  await trigger.click();
  await page.waitForFunction(() => Number(document.querySelector('#support-dialog .support-art').style.getPropertyValue('--box-open')) > .1);
  await dialog.locator('.support-close').click();
  await trigger.evaluate(button => button.click());
  await dialog.locator(':scope[data-state="open"]').waitFor();
  assert.equal(await dialog.isVisible(), true);
  await dialog.locator('.support-close').click();
  await dialog.waitFor({ state: 'hidden' });

  for (const width of [375, 320]) {
    await page.setViewportSize({ width, height: 740 });
    await trigger.click();
    await dialog.locator(':scope[data-state="open"]').waitFor();
    assert.equal(await dialog.evaluate(element => element.scrollTop), 0, 'Reopening starts at the instructions');
    const cardBounds = await dialog.boundingBox();
    assert.ok(Math.abs(cardBounds.width - width) < 2, 'Mobile card fills the viewport width');
    assert.ok(Math.abs(cardBounds.y + cardBounds.height - 740) < 2, 'Mobile card attaches to the bottom');
    assert.ok(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const save = dialog.locator('[data-support-save]');
    const saveBounds = await save.boundingBox();
    assert.ok(saveBounds.height >= 44);
    assert.ok(saveBounds.y < (await image.boundingBox()).y, 'Save action precedes the payment picture');
    await dialog.locator('[data-support-method="wechat"]').click();
    await page.screenshot({ path: path.join(output, prefix + '-support-mobile-' + width + '.png') });
    await image.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, prefix + '-support-mobile-' + width + '-image.png') });
    await page.mouse.click(5, 5);
    await dialog.waitFor({ state: 'hidden' });
  }

  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await trigger.click();
  assert.equal(await dialog.getAttribute('data-state'), 'open');
  assert.equal(await dialog.locator('.support-art').evaluate(art => art.style.getPropertyValue('--box-open')), '1');
  await page.screenshot({ path: path.join(output, prefix + '-support-dark.png') });
  // 原生 close 事件异步到达，也不能覆盖同一轮重新打开的状态。
  await page.evaluate(() => {
    document.querySelector('.support-close').click();
    document.querySelector('[data-open-support]').click();
  });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await dialog.getAttribute('data-state'), 'open');
  assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('support-modal-open')), false);
  assert.deepEqual(await page.locator('.password-row code').allTextContents(), passwords);
  if (toolState) assert.deepEqual(await page.locator('#password-form').evaluate(form => [...form.querySelectorAll('input')].map(input => [input.id || input.value, input.value, input.checked])), toolState);
  assert.equal(await page.evaluate(() => localStorage.getItem('bestools.password.preferences.v1')), preferences);
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), clipboard);
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' });
  await page.setViewportSize(viewport);
}
