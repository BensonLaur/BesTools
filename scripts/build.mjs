import { cp, lstat, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destination = path.resolve(root, 'dist');
const publishFiles = ['index.html', 'tools', 'assets', '.nojekyll'];

// 只清理此项目的 dist，拒绝通过符号链接或路径变化误删其他目录。
if (destination !== path.join(root, 'dist') || path.dirname(destination) !== root) {
  throw new Error('Unexpected build output path');
}
try {
  if ((await lstat(destination)).isSymbolicLink()) throw new Error('dist must not be a symbolic link');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
for (const file of publishFiles) {
  await cp(path.join(root, file), path.join(destination, file), { recursive: true });
}
console.log('静态站点已生成：' + destination);
