import { defineConfig } from 'vitest/config';

export default defineConfig({
  // 相対パスで出力し、GitHub Pages のどのパスに置いても動くようにする
  base: './',
  test: {
    include: ['src/**/*.test.ts'],
  },
});
