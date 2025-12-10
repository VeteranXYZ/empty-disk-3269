import { component$, useSignal, useTask$ } from "@builder.io/qwik";
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

  // 主题切换
  const toggleTheme = $(() => {
    theme.value = theme.value === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", theme.value === "dark");
    localStorage.setItem("theme", theme.value);
  });

  // 声音
  const playSound = $((up: boolean) => {
    if (!soundEnabled.value || !isBrowser) return;
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.frequency.value = up ? 900 : 400;
    o.type = "sine";
    g.gain.setValueAtTime(0.3, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
    o.start();
    o.stop(ctx.currentTime + 0.4);
  });

  // 所有逻辑都放 useTask$（完全不阻塞）
  useTask$(async ({ track, cleanup }) => {
    track(() => isBrowser);
    if (!isBrowser) return;

    // 初始化主题
    const saved = localStorage.getItem("theme") as "dark" | "light" | null;
    if (saved) theme.value = saved;
    else if (window.matchMedia("(prefers-color-scheme: dark)").matches) theme.value = "dark";
    document.documentElement.classList.toggle("dark", theme.value === "dark");

    // 动态加载图表库（首屏 0KB）
    const { createChart } = await import(
      "https://cdn.jsdelivr.net/npm/lightweight-charts@4.1.3/dist/lightweight-charts.standalone.production.js"
    );

    // 价格更新
    const updatePrice = async () => {
      try {
        const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true");
        const d = await r.json();
        const p = d.bitcoin.usd;
        const c = d.bitcoin.usd_24h_change.toFixed(2);
        price.value = "$" + p.toLocaleString();
        change24h.value = (c > 0 ? "+" : "") + c + "%";
        changeColor.value = c > 0 ? "text-green-400" : c < 0 ? "text-red-400" : "text-gray-400";

        if (lastPrice.value && Math.abs((p - lastPrice.value) / lastPrice.value * 100) > 1) {
          playSound(c > 0);
        }
        lastPrice.value = p;
      } catch {
        price.value = "暂无数据";
      }
    };

    // K线
    if (chartContainer.value) {
      const chart = createChart(chartContainer.value, {
        width: chartContainer.value.clientWidth,
        height: 420,
        layout: { background: { color: "transparent" }, textColor: theme.value === "dark" ? "#e5e7eb" : "#1f2937" },
        grid: { vertLines: { color: "#334155" }, horzLines: { color: "#334155" } },
      });
      const series = chart.addCandlestickSeries({
        upColor: "#10b981", downColor: "#ef4444",
        wickUpColor: "#10b981", wickDownColor: "#ef4444",
      });
      const hist = await fetch("https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=90");
      const j = await hist.json();
      const data = j.prices.map((x: number[]) => ({
        time: Math.floor(x[0] / 1000) as any,
        open: x[1], high: x[1] * 1.01, low: x[1] * 0.99, close: x[1],
      }));
      series.setData(data);
      chart.timeScale().fitContent();
    }

    // WebSocket 买卖盘
    const connect = () => {
      const socket = new WebSocket("wss://stream.binance.com:9443/ws/btcusdt@depth20@100ms");
      ws.value = socket;
      socket.onmessage = e => {
        const d = JSON.parse(e.data);
        bids.value = d.bids.map((x: string[]) => [+x[0], +x[1]]).reverse();
        asks.value = d.asks.map((x: string[]) => [+x[0], +x[1]]);
      };
      socket.onclose = () => setTimeout(connect, 2000);
    };
    connect();

    // 深度图
    const draw = () => {
      if (!depthContainer.value) return;
      const c = depthContainer.value;
      const ctx = c.getContext("2d")!;
      c.width = c.clientWidth * 2;
      c.height = 640;
      ctx.clearRect(0, 0, c.width, c.height);
      const mid = c.width / 2;
      const max = Math.max(...bids.value.map(b => b[1]), ...asks.value.map(a => a[1]), 1000);
      const sx = mid / 22;
      const sy = c.height / max / 1.5;

      ctx.fillStyle = "rgba(16,185,129,0.3)";
      ctx.beginPath(); ctx.moveTo(mid, c.height);
      bids.value.forEach((b, i) => ctx.lineTo(mid - (i + 1) * sx, c.height - b[1] * sy));
      ctx.lineTo(0, c.height); ctx.closePath(); ctx.fill();

      ctx.fillStyle = "rgba(239,68,68,0.3)";
      ctx.beginPath(); ctx.moveTo(mid, c.height);
      asks.value.forEach((a, i) => ctx.lineTo(mid + (i + 1) * sx, c.height - a[1] * sy));
      ctx.lineTo(c.width, c.height); ctx.closePath(); ctx.fill();
    };
    const id = setInterval(draw, 300);
    draw();

    updatePrice();
    const pid = setInterval(updatePrice, 8000);

    cleanup(() => {
      clearInterval(id);
      clearInterval(pid);
      ws.value?.close();
    });
  });

  return (
    <div class={`min-h-screen transition-all duration-500 ${theme.value === "dark" ? "bg-gradient-to-br from-gray-900 via-purple-900 to-black text-white" : "bg-gradient-to-br from-blue-50 to-indigo-100 text-gray-900"}`}>
      {theme.value === "dark" && (
        <div class="fixed inset-0 opacity-20 pointer-events-none">
          {Array.from({ length: 40 }).map((_, i) => (
            <div key={i} class="absolute w-1 h-1 bg-white rounded-full animate-pulse" style={{ left: `${Math.random()*100}%`, top: `${Math.random()*100}%`, animationDelay: `${Math.random()*5}s` }} />
          ))}
        </div>
      )}

      <div class="relative z-10 container mx-auto px-4 py-8 max-w-7xl">
        <div class="flex flex-col md:flex-row justify-between items-center mb-8">
          <div>
            <h1 class={`text-5xl md:text-7xl font-bold bg-clip-text ${theme.value === "dark" ? "text-transparent bg-gradient-to-r from-yellow-400 to-orange-500" : "text-indigo-600"}`}>
              Bitcoin 实时看盘
            </h1>
            <div class={`text-4xl md:text-6xl font-mono font-bold mt-4 ${changeColor.value}`}>
              {price.value} <span class="text-2xl ml-4 opacity-80">{change24h.value}</span>
            </div>
          </div>
          <div class="flex gap-4 mt-4 md:mt-0">
            <button onClick$={toggleTheme} class="px-6 py-3 rounded-full bg-white/10 backdrop-blur hover:bg-white/20 transition text-lg font-medium">
              {theme.value === "dark" ? "Light Mode" : "Dark Mode"}
            </button>
            <button onClick$={() => soundEnabled.value = !soundEnabled.value} class={`px-6 py-3 rounded-full text-white font-medium ${soundEnabled.value ? "bg-green-500" : "bg-gray-600"}`}>
              Sound {soundEnabled.value ? "On" : "Off"}
            </button>
          </div>
        </div>

        <div class="grid lg:grid-cols-3 gap-6">
          <div class="lg:col-span-2 bg-black/40 backdrop-blur-xl rounded-2xl p-6 border border-white/10">
            <h2 class="text-2xl font-bold mb-4">K 线图 (90 天)</h2>
            <div ref={chartContainer} class="w-full h-96 rounded-lg" />
          </div>

          <div class="bg-black/40 backdrop-blur-xl rounded-2xl p-6 border border-white/10">
            <h2 class="text-2xl font-bold mb-4">实时买卖盘</h2>
            <div class="space-y-1 text-sm font-mono max-h-96 overflow-y-auto">
              {asks.value.slice(0, 12).map(([p, s]) => (
                <div key={p} class="flex justify-between text-red-400">
                  <span>{p.toFixed(2)}</span>
                  <span>{s.toFixed(2)}</span>
                </div>
              ))}
              <div class="my-2 border-t border-gray-600" />
              {bids.value.slice(0, 12).map(([p, s]) => (
                <div key={p} class="flex justify-between text-green-400">
                  <span>{p.toFixed(2)}</span>
                  <span>{s.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div class="mt-6 bg-black/40 backdrop-blur-xl rounded-2xl p-6 border border-white/10">
          <h2 class="text-2xl font-bold mb-4">市场深度图</h2>
          <canvas ref={depthContainer} class="w-full h-80 rounded-lg" />
        </div>

        <div class="text-center mt-8 text-gray-500">
          Qwik 2025 最快 BTC 看盘 · 首屏 ≈0KB JS · 数据实时更新
        </div>
      </div>
    </div>
  );
});
