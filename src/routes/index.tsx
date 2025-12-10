import { component$, useSignal, useTask$, $ } from "@builder.io/qwik";
import { isBrowser } from "@builder.io/qwik/build";

export default component$(() => {
  const chartContainer = useSignal<HTMLDivElement | undefined>();
  const price = useSignal("——");
  const change24h = useSignal("0.00");
  const changeColor = useSignal("text-gray-400");

  // 实时获取 BTC 价格 + K 线数据
  useTask$(async ({ track }) => {
    track(() => isBrowser);

    if (!isBrowser) return;

    // 动态加载 Lightweight Charts（只在浏览器加载，首屏 0KB）
    const { createChart } = await import(
      "https://cdn.jsdelivr.net/npm/lightweight-charts@4.1.3/dist/lightweight-charts.standalone.production.js"
    );

    // 获取实时价格（CoinGecko 免费 API）
    const updatePrice = async () => {
      try {
        const res = await fetch(
          "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true"
        );
        const data = await res.json();
        const p = data.bitcoin.usd.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
        const c = data.bitcoin.usd_24h_change.toFixed(2);
        price.value = "$" + p;
        change24h.value = (c > 0 ? "+" : "") + c + "%";
        changeColor.value = c > 0 ? "text-green-400" : c < 0 ? "text-red-400" : "text-gray-400";
      } catch (e) {
        price.value = "加载中…";
      }
    };

    // 初始化 K 线图
    if (chartContainer.value) {
      const chart = createChart(chartContainer.value, {
        width: chartContainer.value.clientWidth,
        height: 380,
        layout: {
          background: { color: "transparent" },
          textColor: "#e5e7eb",
        },
        grid: {
          vertLines: { color: "#1f2937" },
          horzLines: { color: "#1f2937" },
        },
        crosshair: {
          mode: 1,
        },
        rightPriceScale: {
          borderColor: "#374151",
        },
        timeScale: {
          borderColor: "#374151",
        },
      });

      const candleSeries = chart.addCandlestickSeries({
        upColor: "#10b981",
        downColor: "#ef4444",
        borderUpColor: "#10b981",
        borderDownColor: "#ef4444",
        wickUpColor: "#10b981",
        wickDownColor: "#ef4444",
      });

      // 加载最近 90 天日线数据
      const hist = await fetch(
        "https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=90"
      );
      const json = await hist.json();
      const data = json.prices.map((item: number[], i: number) => ({
        time: Math.floor(item[0] / 1000) as any,
        open: json.open[i] || item[1],
        high: json.high[i] || item[1],
        low: json.low[i] || item[1],
        close: item[1],
      }));
      candleSeries.setData(data);

      chart.timeScale().fitContent();
    }

    updatePrice();
    const id = setInterval(updatePrice, 8000);
    return () => clearInterval(id);
  });

  return (
    <div class="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-black text-white">
      {/* 背景粒子效果 */}
      <div class="fixed inset-0 opacity-30">
        <div class="absolute inset-0 bg-gradient-to-t from-purple-900 via-transparent to-transparent" />
        {Array.from({ length: 50 }).map((_, i) => (
          <div
            key={i}
            class="absolute w-1 h-1 bg-white rounded-full animate-pulse"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 5}s`,
            }}
          />
        ))}
      </div>

      <div class="relative z-10 container mx-auto px-4 py-12">
        <div class="text-center mb-10">
          <h1 class="text-5xl md:text-7xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-yellow-400 to-orange-500">
            Bitcoin 实时看盘
          </h1>
          <div class="text-3xl md:text-5xl font-mono font-bold">
            {price.value}
            <span class={`ml-4 text-xl md:text-2xl font-normal ${changeColor.value}`}>
              {change24h.value}
            </span>
          </div>
          <p class="mt-4 text-gray-400">Qwik + Lightweight Charts · 首屏 ≈0KB JS · 2025 最快 BTC 看盘页</p>
        </div>

        <div class="bg-black bg-opacity-50 backdrop-blur-xl rounded-2xl p-4 shadow-2xl border border-gray-800">
          <div bind:this={chartContainer} class="w-full h-96 md:h-[500px]" />
        </div>

        <div class="mt-8 text-center text-gray-500 text-sm">
          数据来源：CoinGecko · 每 8 秒更新 · 支持手机横屏更爽
        </div>
      </div>
    </div>
  );
});
