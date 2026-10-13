import test from 'node:test';
import assert from 'node:assert/strict';
import { AMBIGUOUS_CHARACTERS, CHARACTER_GROUPS, DEFAULT_OPTIONS, generatePasswords, prepareOptions } from '../tools/password/generator.js';
import { defaults, loadPreferences, savePreferences, PREFERENCE_KEY } from '../tools/password/preferences.js';

test('生成的批量密码遵守长度、排除规则和全部所选类别', () => {
  for (const length of [4, 10, 16, 128]) {
    const options = { ...defaults(), length, count: 100, groups: Object.keys(CHARACTER_GROUPS), excluded: '{}[]' };
    const results = generatePasswords(options);
    assert.equal(results.length, 100);
    const { selected, alphabet } = prepareOptions(options);
    for (const password of results) {
      assert.equal(password.length, length);
      assert.ok([...password].every(character => alphabet.includes(character)));
      assert.ok(![...password].some(character => (AMBIGUOUS_CHARACTERS + '{}[]').includes(character)));
      for (const group of selected) assert.ok([...password].some(character => group.includes(character)));
    }
  }
});

test('单一类别、关闭易读模式与自定义排除可组合', () => {
  const options = { ...defaults(), groups: ['digits'], readable: false, excluded: '12345678', length: 128 };
  assert.match(generatePasswords(options)[0], /^[09]{128}$/);
});

test('拒绝采样舍弃 uint32 无法均匀分配的尾部', () => {
  const cryptoProvider = { getRandomValues(buffer) { buffer.fill(0); buffer[0] = 0xffffffff; buffer[1] = 9; return buffer; } };
  assert.equal(generatePasswords({ ...defaults(), length: 4, groups: ['digits'], readable: false }, cryptoProvider)[0], '9000');
});

test('整串采样会拒绝未覆盖全部类别的候选', () => {
  const cryptoProvider = { getRandomValues(buffer) { buffer.fill(0); buffer.set([0, 0, 0, 0, 0, 26, 52, 0]); return buffer; } };
  assert.equal(generatePasswords({ ...defaults(), length: 4, readable: false }, cryptoProvider)[0], 'Aa0A');
});

test('无安全随机源时不降级；极端规则有耗时上限', () => {
  assert.throws(() => generatePasswords(defaults(), null), /安全随机源/);
  const stuck = { getRandomValues(buffer) { buffer.fill(0); return buffer; } };
  assert.throws(() => generatePasswords(defaults(), stuck), /耗时较长/);
});

test('拒绝非法长度、数量、类型及移空整类的排除规则', () => {
  for (const length of [0, 3, 129, 4.5, NaN]) assert.throws(() => generatePasswords({ ...defaults(), length }), /长度/);
  for (const count of [0, 101, 1.5, NaN]) assert.throws(() => generatePasswords({ ...defaults(), count }), /数量/);
  assert.throws(() => generatePasswords({ ...defaults(), groups: [] }), /至少选择/);
  assert.throws(() => generatePasswords({ ...defaults(), groups: ['constructor'] }), /类型无效/);
  assert.throws(() => generatePasswords({ ...defaults(), excluded: CHARACTER_GROUPS.digits }), /一整类/);
  assert.throws(() => generatePasswords({ ...defaults(), groups: ['digits'], excluded: '123456789', readable: false }), /至少需要两个/);
  assert.throws(() => generatePasswords({ ...defaults(), excluded: 'a'.repeat(129) }), /最多/);
});

test('持久化白名单不含密码，停用时删除，损坏或受限存储可恢复', () => {
  const map = new Map();
  const storage = { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) };
  const options = { ...defaults(), length: 24, passwords: ['NEVER_STORE_THIS'] };
  savePreferences(storage, options);
  assert.ok(!storage.getItem(PREFERENCE_KEY).includes('NEVER_STORE_THIS'));
  assert.deepEqual(Object.keys(JSON.parse(storage.getItem(PREFERENCE_KEY))).sort(), ['version', 'length', 'count', 'groups', 'readable', 'excluded'].sort());
  assert.equal(loadPreferences(storage).length, 24);
  savePreferences(storage, { ...options, remember: false });
  assert.equal(storage.getItem(PREFERENCE_KEY), null);
  storage.setItem(PREFERENCE_KEY, '{broken');
  assert.deepEqual(loadPreferences(storage), defaults());
  storage.setItem(PREFERENCE_KEY, JSON.stringify({ version: 1, ...options, length: 999 }));
  assert.deepEqual(loadPreferences(storage), defaults());
  assert.deepEqual(loadPreferences(undefined), defaults());
  assert.equal(DEFAULT_OPTIONS.length, 16);
});
