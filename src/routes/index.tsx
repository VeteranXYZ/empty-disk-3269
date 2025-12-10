// src/routes/index.tsx
import { component$, useSignal, useTask$, useVisibleTask$, $ } from "@builder.io/qwik";
import { isBrowser } from "@builder.io/qwik/build";

export default component$(() => {
  const price = useSignal("——");
  const change24h = useSignal("0.00");
  const changeColor = useSignal("text-gray-400");
  const theme = useSignal<"dark" | "light">("dark");
  const soundEnabled = useSignal(true);
  const bids = useSignal<Array<[number, number]>>([]);
  const asks = useSignal<Array<[number, number]>>([]);
  const ws = useSignal<WebSocket | null>(null);
  const chartContainer = useSignal<HTMLDivElement>();
  const depthContainer = useSignal<HTMLCanvasElement>();
  const lastPrice = useSignal(0);

  // 主题切换（只能在浏览器运行）
  const toggleTheme = $(() => {
    theme.value = theme.value === "dark" ? "light" : "dark";
    if (isBrowser) {
      document.documentElement.classList.toggle("dark", theme.value === "dark");
      localStorage.setItem("theme", theme.value);
    }
  });

  // 声音（纯浏览器）
  const playSound = $((up: boolean) => {
    if (!soundEnabled.value || !isBrowser) return;
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.frequency.value = up ? 900 : 400;
    o.type = "sine";
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
    o.start(ctx.currentTime);
    o.stop(ctx.currentTime + 0.4);
  });

  // 关键：全部移到 useVisibleTask$，它在 SSR 时根本不会执行函数体！
  useVisibleTask$(() => {
    // 1. 初始化主题（只在浏览器执行）
    const saved = localStorage.getItem("theme") as "dark" | "light" | null;
    if (saved) {
      theme.value = saved;
    } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      theme.value = "dark";
    }
    document.documentElement.classList.toggle("dark", theme.value === "dark");

    // 2. 价格轮询
    const updatePrice = async () => {
      try {
        const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true");
        const d = await r.json();
        const p = d.bitcoin.usd;
        const c = Number(d.bitcoin.usd_24h_change.toFixed(2));

        price.value = "$" + p.toLocaleString("en-US");
        change24h.value = (c > 0 ? "+" : "") + c + "%";
        changeColor.value = c > 0 ? "text-green-400" : c < 0 ? "text-red-400" : "text-gray-400";

        if (lastPrice.value && Math.abs((p - lastPrice.value) / lastPrice.value) > 0.01) {
          playSound(c > 0);
        }
        lastPrice.value = p;
      } catch (e) {
        price.value = "暂无数据";
      }
    };
    updatePrice();
    const priceInterval = setInterval(updatePrice, 8000);

    // 3. K线图（动态导入）
    (async () => {
      if (!chartContainer.value) return;
      const { createChart } = await import(
        "https://cdn.jsdelivr.net/npm/lightweight-charts@4.1.3/dist/lightweight-charts.standalone.production.js"
      );

      const chart = createChart(chartContainer.value!, {
        width: chartContainer.value!.clientWidth,
        height: 420,
        layout: { background: { color: "transparent" }, textColor: theme.value === "dark" ? "#e5e7eb" : "#1f2937" },
        grid: { vertLines: { color: "#334155" }, horzLines: { color: "#334155" } },
      });

      const series = chart.addCandlestickSeries({
        upColor: "#10b981", downColor: "#ef4444",
        wickUpColor: "#10b981", wickDownColor: "#ef4444",
      });

      const resp = await fetch("https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=90&interval=daily");
      const j = await resp.json();
      const data = j.prices.map((x: number[]) => ({
        time: Math.floor(x[0] / 1000) as any,
        open: x[1],
        high: x[1] * 1.01,
        low: x[1] * 0.99,
        close: x[1],
      }));
      series.setData(data);
      chart.timeScale().fitContent();

      // 响应式
      const resize = () => chart.applyOptions({ width: chartContainer.value!.clientWidth });
      window.addEventListener("resize", resize);
      return () => window.removeEventListener("resize", resize);
    })();

    // 4. WebSocket 深度数据
    const connect = () => {
      const socket = new WebSocket("wss://stream.binance.com:9443/ws/btcusdt@depth20@100ms");
      ws.value = socket;
      socket.onmessage = (e) => {
        const d = JSON.parse(e.data);
        bids.value = (d.bids || []).map((x: string[]) => [+x[0], +x[1]]).reverse();
        asks.value = (d.asks || []).map((x: string[]) => [+x[0], +x[1]]);
      };
      socket.onclose = () => setTimeout(connect, 2000);
    };
    connect();

    // 5. 深度图绘制
    const draw = () => {
      if (!depthContainer.value) return;
      const canvas = depthContainer.value;
      const ctx = canvas.getContext("2d")!;
      const width = canvas.clientWidth * devicePixelRatio;
      const height = 640 * devicePixelRatio;
      canvas.width = width;
      canvas.height = height;

      ctx.clearRect(0, 0, width, height);
      const mid = width / 2;
      const maxQty = Math.max(...bids.value.map(b => b[1]), ...asks.value.map(a => a[1]), 1000);
      const scaleX = mid / 22;
      const scaleY = (height * 0.9) / maxQty;

      // bids（绿）
      ctx.fillStyle = "rgba(16,185,129,0.3)";
      ctx.beginPath();
      ctx.moveTo(mid, height);
      bids.value.slice(0, 20).forEach((b, i) => {
        ctx.lineTo(mid - (i + 1) * scaleX, height - b[1] * scaleY);
      });
      ctx.lineTo(0, height);
      ctx.closePath();
      ctx.fill();

      // asks（红）
      ctx.fillStyle = "rgba(239,68,68,0.3)";
      ctx.beginPath();
      ctx.moveTo(mid, height);
      asks.value.slice(0, 20).forEach((a, i) => {
        ctx.lineTo(mid + (i + 1) * scaleX, height - a[1] * scaleY);
      });
      ctx.lineTo(width, height);
      ctx.closePath();
      ctx.fill();
    };

    const drawInterval = setInterval(draw, 300);
    draw();

    // 清理
    return () => {
      clearInterval(priceInterval);
      clearInterval(drawInterval);
      ws.value?.close();
    };
  });

  return (
    <div class={`min-h-screen transition-all duration-500 ${theme.value === "dark" ? "bg-gradient-to-br from-gray-900 via-purple-900 to-black text-white" : "bg-gradient-to-br from-blue-50 to-indigo-100 text-gray-900"}`}>
      {/* 背景星星动画只在暗色模式显示 */}
      {theme.value === "dark" && (
        <div class="fixed inset-0 opacity-20 pointer-events-none">
          {Array.from({ length: 40 }).map((_, i) => (
            <div
              key={i}
              class="absolute w-1 h-1 bg-white rounded-full animate-pulse"
              style={{ left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%`, animationDelay: `${Math.random() * 5}s` }}
            />
          ))}
        </div>
      )}

      <div class="relative z-10 container mx-auto px-4 py-8 max-w-7xl">
        {/* 标题区 */}
        <div class="flex flex-col md:flex-row justify-between items-center mb-8">
          <div>
            <h1 class={`text-5xl md:text-7xl font-bold bg-clip-text ${theme.value === "dark" ? "text-transparent bg-gradient-to-r from-yellow-400 to-orange-500" : "text-indigo-600"}`}>
              Bitcoin 实时看盘
            </h1>
            <div class={`text-4xl md:text-6xl font-mono font-bold mt-4 ${changeColor.value}`}>
              {price.value} <span class="text-2xl ml-4 opacity-80">{change24h.value}</span>
            </div>
          </div>

          <div class="flex gap-4 mt-6 md:mt-0">
            <button
              onClick$={toggleTheme}
              class="px-6 py-3 rounded-full bg-white/10 backdrop-blur hover:bg-white/20 transition text-lg font-medium"
            >
              {theme.value === "dark" ? "Light Mode" : "Dark Mode"}
            </button>
            <button
              onClick$={() => soundEnabled.value = !soundEnabled.value}
              class={`px-6 py-3 rounded-full text-white font-medium transition ${soundEnabled.value ? "bg-green-500 hover:bg-green-600" : "bg-gray-600"}`}
            >
              Sound {soundEnabled.value ? "On" : "Off"}
            </button>
          </div>
        </div>

        {/* 主内容网格 */}
        <div class="grid lg:grid-cols-3 gap-6">
          <div class="lg:col-span-2 bg-black/40 backdrop-blur-xl rounded-2xl p-6 border border-white/10">
            <h2 class="text-2xl font-bold mb-4 text-white">K 线图 (90 天)</h2>
            <div ref={chartContainer} class="w-full h-96 rounded-lg bg-black/60" />
          </div>

          <div class="bg-black/40 backdrop-blur-xl rounded-2xl p-6 border border-white/10">
            <h2 class="text-2xl font-bold mb-4 text-white">实时买卖盘</h2>
            <div class="space-y-1 text-sm font-mono max-h-96 overflow-y-auto">
              {asks.value.slice(0, 12).map(([p, s]) => (
                <div key={p} class="flex justify-between text-red-400">
                  <span>{p.toFixed(2)}</span>
                  <span>{s.toFixed(4)}</span>
                </div>
              ))}
              <div class="my-2 border-t border-gray-600" />
              {bids.value.slice(0, 12).map(([p, s]) => (
                <div key={p} class="flex justify-between text-green-400">
                  <span>{p.toFixed(2)}</span>
                  <span>{s.toFixed(4)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div class="mt-6 bg-black/40 backdrop-blur-xl rounded-2xl p-6 border border-white/10">
          <h2 class="text-2xl font-bold mb-4 text-white">市场深度图</h2>
          <canvas ref={depthContainer} class="w-full h-80 rounded-lg block bg-black/60" />
        </div>

        <div class="text-center mt-8 text-gray-500 text-sm">
          Qwik 2025 · 首屏 ≈0KB JS · 实时数据 · 已适配阿里云 Pages 部署
        </div>
      </div>
    </div>
  );
});
