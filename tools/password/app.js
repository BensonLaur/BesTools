import { generatePasswords, prepareOptions } from './generator.js';
import { defaults, loadPreferences, savePreferences, PREFERENCE_KEY } from './preferences.js';

const byId = id => document.getElementById(id);
const form = byId('password-form');
const groupInputs = [...form.querySelectorAll('[name="groups"]')];
const lengthInput = byId('length');
const lengthRange = byId('length-range');
const countInput = byId('count');
const excludedInput = byId('excluded');
const readableInput = byId('readable');
const rememberInput = byId('remember');
const resultsList = byId('results');
const status = byId('result-status');
let currentPasswords = [];
let resultVersion = 0;
let storage;
try { storage = window.localStorage; } catch { /* 浏览器禁止持久化时，工具仍可在内存中运行。 */ }

function readOptions() {
  return {
    length: lengthInput.valueAsNumber,
    count: countInput.valueAsNumber,
    groups: groupInputs.filter(input => input.checked).map(input => input.value),
    readable: readableInput.checked,
    excluded: excludedInput.value,
    remember: rememberInput.checked
  };
}

function syncLength() {
  if (lengthInput.validity.valid && lengthInput.value !== '') lengthRange.value = lengthInput.value;
  form.querySelectorAll('[data-length]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.length) === lengthInput.valueAsNumber)));
}

function fillOptions(options) {
  lengthInput.value = options.length;
  countInput.value = options.count;
  groupInputs.forEach(input => { input.checked = options.groups.includes(input.value); });
  readableInput.checked = options.readable;
  excludedInput.value = options.excluded;
  rememberInput.checked = options.remember;
  syncLength();
}

function showError(message = '') {
  byId('form-error').textContent = message;
  byId('form-error').hidden = !message;
}

function persist() {
  if (!storage) return;
  try { savePreferences(storage, readOptions()); }
  catch { /* 无效的临时输入不覆盖上一次有效偏好。 */ }
}

function clearResults() {
  resultVersion += 1;
  currentPasswords = [];
  resultsList.replaceChildren();
  resultsList.hidden = true;
  byId('result-empty').hidden = false;
  byId('result-actions').hidden = true;
  byId('result-meta').textContent = '等待生成';
  byId('generate-label').textContent = '生成密码';
  status.textContent = '';
}

async function copy(text) {
  const version = resultVersion;
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(text);
    if (version === resultVersion) status.textContent = text.includes('\n') ? '全部密码已复制。' : '密码已复制。';
  } catch {
    if (version === resultVersion) status.textContent = '浏览器未允许复制，请选中结果后手动复制。';
  }
}

form.addEventListener('submit', event => {
  event.preventDefault();
  showError();
  try {
    const options = readOptions();
    const passwords = generatePasswords(options);
    clearResults();
    currentPasswords = passwords;
    const fragment = document.createDocumentFragment();
    passwords.forEach((password, index) => {
      const item = document.createElement('li');
      item.className = 'password-row';
      const top = document.createElement('div');
      top.className = 'password-row-top';
      const label = document.createElement('span');
      label.textContent = '密码 ' + String(index + 1).padStart(2, '0');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'copy-one';
      button.textContent = '复制';
      button.setAttribute('aria-label', '复制第 ' + (index + 1) + ' 个密码');
      button.addEventListener('click', () => copy(password));
      const code = document.createElement('code');
      code.textContent = password;
      top.append(label, button);
      item.append(top, code);
      fragment.append(item);
    });
    resultsList.append(fragment);
    resultsList.hidden = false;
    byId('result-empty').hidden = true;
    byId('result-actions').hidden = false;
    byId('result-meta').textContent = passwords.length + ' 个 · ' + options.length + ' 位';
    byId('generate-label').textContent = '重新生成';
    status.textContent = '已生成 ' + passwords.length + ' 个密码。';
    persist();
    if (window.matchMedia('(max-width: 660px)').matches) resultsList.scrollIntoView({ behavior: 'instant', block: 'nearest' });
  } catch (error) { clearResults(); showError(error.message); }
});

form.addEventListener('input', () => {
  syncLength();
  showError();
  // 规则改变就清除旧结果，避免将旧密码误认成新规则的产物。
  clearResults();
  persist();
});
lengthRange.addEventListener('input', () => { lengthInput.value = lengthRange.value; syncLength(); persist(); });
form.querySelectorAll('[data-length]').forEach(button => button.addEventListener('click', () => {
  lengthInput.value = button.dataset.length;
  syncLength(); clearResults(); showError(); persist();
}));
byId('reset').addEventListener('click', () => {
  fillOptions(defaults()); clearResults(); showError();
  try { storage?.removeItem(PREFERENCE_KEY); } catch { /* 重置也不依赖存储可用。 */ }
});
byId('clear').addEventListener('click', () => { clearResults(); form.querySelector('[type="submit"]').focus(); });
byId('copy-all').addEventListener('click', () => { if (currentPasswords.length) copy(currentPasswords.join('\n')); });
// bfcache 恢复也清除密码；生成结果的生命周期严格限定于当前访问。
window.addEventListener('pagehide', clearResults);
fillOptions(loadPreferences(storage));
prepareOptions(readOptions());
form.querySelector('[type="submit"]').disabled = false;
