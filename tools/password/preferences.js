import { DEFAULT_OPTIONS, prepareOptions } from './generator.js';

export const PREFERENCE_KEY = 'bestools.password.preferences.v1';

export function defaults() { return { ...DEFAULT_OPTIONS, groups: [...DEFAULT_OPTIONS.groups] }; }

export function loadPreferences(storage) {
  try {
    const saved = JSON.parse(storage.getItem(PREFERENCE_KEY));
    if (!saved || saved.version !== 1) return defaults();
    const options = {
      length: saved.length,
      count: saved.count,
      groups: saved.groups,
      readable: saved.readable === true,
      excluded: saved.excluded,
      remember: true
    };
    prepareOptions(options);
    return options;
  } catch { return defaults(); }
}

export function savePreferences(storage, options) {
  if (!options.remember) { storage.removeItem(PREFERENCE_KEY); return; }
  prepareOptions(options);
  // 显式白名单，禁止把生成结果或其他页面状态混入持久化内容。
  const { length, count, groups, readable, excluded } = options;
  storage.setItem(PREFERENCE_KEY, JSON.stringify({ version: 1, length, count, groups, readable, excluded }));
}
