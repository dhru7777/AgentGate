import { Chart, registerables, type ChartConfiguration, type ChartDataset } from "chart.js";
import { useEffect, useRef } from "react";

Chart.register(...registerables);
Chart.defaults.font.family = "Georgia, serif";
Chart.defaults.color = "#555";

type LineSet = { label: string; data: number[]; borderColor: string };

function useChart(config: ChartConfiguration) {
  const ref = useRef<HTMLCanvasElement>(null);
  const serialized = JSON.stringify(config.data);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const chart = new Chart(canvas, config);
    return () => chart.destroy();
    // config.data is serialized so charts refresh when the numbers change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serialized, config.type]);

  return ref;
}

export function LineChart({ labels, datasets }: { labels: string[]; datasets: LineSet[] }) {
  const ref = useChart({
    type: "line",
    data: {
      labels,
      datasets: datasets.map((set) => ({
        label: set.label,
        data: set.data,
        borderColor: set.borderColor,
        tension: 0.2,
        fill: false,
        pointRadius: 2,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { position: "bottom" } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
  return <canvas ref={ref} />;
}

export function DoughnutChart({
  labels,
  values,
  colors,
}: {
  labels: string[];
  values: number[];
  colors?: string[];
}) {
  const ref = useChart({
    type: "doughnut",
    data: {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: colors ?? ["#007acc", "#333", "#c45c26", "#888", "#9bbc5a"],
        },
      ],
    },
    options: { plugins: { legend: { position: "bottom" } }, maintainAspectRatio: false },
  });
  return <canvas ref={ref} />;
}

export function BarChart({ labels, values }: { labels: string[]; values: number[] }) {
  const dataset: ChartDataset<"bar"> = { label: "Requests", data: values, backgroundColor: "#007acc" };
  const ref = useChart({
    type: "bar",
    data: { labels, datasets: [dataset] },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
  return <canvas ref={ref} />;
}
