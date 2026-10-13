const triggers = [...document.querySelectorAll('[data-open-support]')];
const methods = {
  wechat: { name: '微信', payee: 'Benson(**城)', width: 1266, height: 1749 },
  alipay: { name: '支付宝', payee: 'Bes软件', width: 1080, height: 1680 }
};

if (triggers.length) {
  // 共享面板只管理支持入口，不访问工具输入、生成结果、存储或剪贴板。
  const dialog = document.createElement('dialog');
  dialog.id = 'support-dialog';
  dialog.className = 'support-dialog';
  dialog.setAttribute('aria-labelledby', 'support-title');
  dialog.setAttribute('aria-describedby', 'support-description');
  dialog.innerHTML = `
    <div class="support-dialog-head">
      <div class="support-art" aria-hidden="true"><span class="support-box-glow"></span><span class="support-box-body"><span class="support-box-heart">♡</span></span><span class="support-box-lid"><span class="support-box-handle"></span></span><span class="support-box-latch"></span></div>
      <div><p class="support-kicker">自愿支持 · BesTools</p><h2 id="support-title">给工具箱添点心意</h2></div>
      <button class="support-close" type="button" aria-label="关闭支持卡片" autofocus>×</button>
    </div>
    <div class="support-dialog-body">
      <div class="support-details">
        <p id="support-description">BesTools 开源（<a class="support-source-link" href="https://github.com/BensonLaur/BesTools" target="_blank" rel="noopener noreferrer">查看 GitHub 源代码 <span aria-hidden="true">↗</span></a>）、免费，且没有任何广告。如果这些小工具帮你省了点事，欢迎自愿支持我继续打磨，也慢慢添上新的工具。</p>
        <p class="support-voluntary">打赏金额由你决定。使用、分享和认真反馈，也都是珍贵的支持。</p>
        <div class="support-methods" aria-label="选择收款方式"><button type="button" data-support-method="wechat" aria-pressed="true">微信</button><button type="button" data-support-method="alipay" aria-pressed="false">支付宝</button></div>
        <p class="support-payee" aria-live="polite"></p>
        <div class="support-image-actions"><a class="button secondary" data-support-save>保存原图 <span aria-hidden="true">↓</span></a><a data-support-original target="_blank" rel="noopener noreferrer">打开原图 <span aria-hidden="true">↗</span></a></div>
        <p class="support-instruction">电脑上用手机扫码；手机上保存原图，再在微信或支付宝中从相册识别。付款前请核对收款人。</p>
      </div>
      <div class="support-payment"><img data-support-image alt="" decoding="async"></div>
    </div>`;
  document.body.append(dialog);

  const arts = [...document.querySelectorAll('.support-art')];
  const image = dialog.querySelector('[data-support-image]');
  const closeButton = dialog.querySelector('.support-close');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let selectedMethod = 'wechat';
  let opener;
  let progress = 0;
  let animationFrame = 0;
  let transitionVersion = 0;
  let desiredOpen = false;
  let backdropPointer = false;

  function selectMethod(method) {
    const selected = methods[method];
    if (!selected) return;
    selectedMethod = method;
    const url = new URL('./support/' + method + '.png', import.meta.url).href;
    image.src = url;
    image.width = selected.width;
    image.height = selected.height;
    image.alt = selected.name + '收款原图，收款主体 ' + selected.payee;
    dialog.querySelector('.support-payee').textContent = selected.name + ' · ' + selected.payee;
    const save = dialog.querySelector('[data-support-save]');
    save.href = url;
    save.download = 'BesTools-' + method + '.png';
    dialog.querySelector('[data-support-original]').href = url;
    dialog.querySelectorAll('[data-support-method]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.supportMethod === method)));
  }

  function draw(value) {
    progress = value;
    arts.forEach(art => art.style.setProperty('--box-open', String(value)));
  }

  function transition() {
    // 重定向沿当前进度继续；旧帧与旧完成回调不能关闭刚重新打开的面板。
    cancelAnimationFrame(animationFrame);
    const version = ++transitionVersion;
    const start = progress;
    const target = desiredOpen ? 1 : 0;
    const duration = reducedMotion.matches ? 0 : 440 * Math.abs(target - start);
    const started = performance.now();
    dialog.dataset.state = desiredOpen ? 'opening' : 'closing';
    function tick(now) {
      if (version !== transitionVersion) return;
      const fraction = duration === 0 ? 1 : Math.min(1, (now - started) / duration);
      draw(start + (target - start) * (1 - (1 - fraction) ** 3));
      if (fraction < 1) animationFrame = requestAnimationFrame(tick);
      else if (desiredOpen) dialog.dataset.state = 'open';
      else { dialog.close(); resetClosed(); }
    }
    tick(started);
  }

  function open(trigger) {
    opener = trigger;
    desiredOpen = true;
    // 原图只在主动打开面板时加载，其他工具操作不会触发支持内容。
    selectMethod(selectedMethod);
    if (!dialog.open) { dialog.showModal(); dialog.scrollTop = 0; }
    document.documentElement.classList.add('support-modal-open');
    triggers.forEach(button => button.setAttribute('aria-expanded', 'true'));
    transition();
    closeButton.focus({ preventScroll: true });
  }

  function close() {
    if (!dialog.open || !desiredOpen) return;
    desiredOpen = false;
    transition();
  }

  function resetClosed() {
    desiredOpen = false;
    cancelAnimationFrame(animationFrame);
    transitionVersion += 1;
    draw(0);
    dialog.dataset.state = 'closed';
    document.documentElement.classList.remove('support-modal-open');
    triggers.forEach(button => button.setAttribute('aria-expanded', 'false'));
    opener?.focus({ preventScroll: true });
  }
  // 原生 close 事件延后派发；同步复位滚动，并忽略重新打开后的旧事件。
  dialog.addEventListener('close', () => { if (!dialog.open) resetClosed(); });
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  // 显式循环首尾焦点，避免原生 dialog 的 Tab 边界跳到浏览器界面。
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const focusable = [...dialog.querySelectorAll('button:not([disabled]), a[href]')];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  closeButton.addEventListener('click', close);
  dialog.querySelectorAll('[data-support-method]').forEach(button => button.addEventListener('click', () => selectMethod(button.dataset.supportMethod)));
  const outside = event => {
    const bounds = dialog.getBoundingClientRect();
    return event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom;
  };
  // 只有按下与释放都在遮罩上才关闭，避免滚动、拖拽原图时误触。
  dialog.addEventListener('pointerdown', event => { backdropPointer = event.target === dialog && outside(event); });
  dialog.addEventListener('pointerup', event => { if (backdropPointer && outside(event)) close(); backdropPointer = false; });
  dialog.addEventListener('pointercancel', () => { backdropPointer = false; });
  reducedMotion.addEventListener('change', () => { if (dialog.open) transition(); });
  triggers.forEach(button => {
    button.addEventListener('click', () => open(button));
    button.disabled = false;
  });
}
