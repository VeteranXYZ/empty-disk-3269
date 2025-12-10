/** @jsxImportSource react */
import { component$ } from '@builder.io/qwik';

export default component$(() => {
  return (
    <div class="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 text-white flex items-center justify-center">
      <div class="text-center p-10">
<h1 class="text-6xl md:text-8xl font-bold mb-4">

          Hi, 我是 [你的名字]
        </h1>
        <p class="text-2xl md:text-4xl opacity-90 mb-8">
          这个页面首屏加载了 <span class="text-yellow-400 font-bold">0KB</span> JavaScript
        </p>
        <button
          onClick$={() => alert('Qwik 太快了以至于你点我都来不及加载 JS！')}
          class="bg-white text-purple-900 px-8 py-4 rounded-full text-xl font-bold hover:scale-110 transition-transform"
        >
          点我试试（瞬间响应）
        </button>

        <p class="mt-12 text-sm opacity-70">
          技术栈：Qwik + resumability + 阿里云 Pages（2025 最快前端方案之一）
        </p>
      </div>
    </div>
  );
});
