export const CHARACTER_GROUPS = Object.freeze({
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  digits: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{};:,.?/'
});
export const AMBIGUOUS_CHARACTERS = '0Oo1Il';
export const DEFAULT_OPTIONS = Object.freeze({
  length: 16,
  count: 1,
  groups: Object.freeze(['uppercase', 'lowercase', 'digits']),
  readable: true,
  excluded: '',
  remember: true
});

export function prepareOptions(options) {
  const { length, count, groups, readable, excluded } = options;
  if (!Number.isInteger(length) || length < 4 || length > 128) throw new Error('密码长度请输入 4–128 之间的整数。');
  if (!Number.isInteger(count) || count < 1 || count > 100) throw new Error('生成数量请输入 1–100 之间的整数。');
  if (!Array.isArray(groups) || groups.length === 0) throw new Error('请至少选择一类字符。');
  if (groups.some(group => !Object.hasOwn(CHARACTER_GROUPS, group))) throw new Error('字符类型无效，请恢复默认设置。');
  if (typeof excluded !== 'string' || excluded.length > 128) throw new Error('额外排除字符最多填写 128 个字符。');
  const excludedSet = new Set((readable ? AMBIGUOUS_CHARACTERS : '') + excluded);
  const selected = [...new Set(groups)].map(group => [...CHARACTER_GROUPS[group]].filter(character => !excludedSet.has(character)).join(''));
  if (selected.some(group => group.length === 0)) throw new Error('排除规则移除了一整类已选字符，请调整规则或取消该类型。');
  const alphabet = selected.join('');
  if (alphabet.length < 2) throw new Error('可用字符至少需要两个，请调整排除规则。');
  return { length, count, selected, alphabet };
}

function createRandomIndex(cryptoProvider) {
  if (!cryptoProvider || typeof cryptoProvider.getRandomValues !== 'function') {
    throw new Error('浏览器未提供安全随机源。请通过 HTTPS 或本地预览打开，不会使用普通随机数代替。');
  }
  const buffer = new Uint32Array(256);
  let offset = buffer.length;
  return maximum => {
    // 舍弃无法等分的尾部，避免取模让部分字符更容易出现。
    const limit = Math.floor(0x100000000 / maximum) * maximum;
    let value;
    do {
      if (offset === buffer.length) { cryptoProvider.getRandomValues(buffer); offset = 0; }
      value = buffer[offset++];
    } while (value >= limit);
    return value % maximum;
  };
}

export function generatePasswords(options, cryptoProvider = globalThis.crypto) {
  const { length, count, selected, alphabet } = prepareOptions(options);
  const randomIndex = createRandomIndex(cryptoProvider);
  const results = [];
  let attempts = 0;
  while (results.length < count) {
    // 整串均匀生成后再筛选，保证类别覆盖而不偏向某种排列。
    // 上限防止极端排除规则令主线程长时间停留；失败时不返回部分结果。
    if (++attempts > Math.max(20000, count * 2000)) throw new Error('当前字符规则生成耗时较长，请增加密码长度或调整排除规则后重试。');
    let password = '';
    for (let index = 0; index < length; index += 1) password += alphabet[randomIndex(alphabet.length)];
    if (selected.every(group => [...password].some(character => group.includes(character)))) results.push(password);
  }
  return results;
}
