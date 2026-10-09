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

export function StackedBarChart({
  labels,
  series,
}: {
  labels: string[];
  series: { label: string; data: number[]; color: string }[];
}) {
  const ref = useChart({
    type: "bar",
    data: {
      labels,
      datasets: series.map((set) => ({ label: set.label, data: set.data, backgroundColor: set.color })),
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom" } },
      scales: { x: { stacked: true, beginAtZero: true, ticks: { precision: 0 } }, y: { stacked: true } },
    },
  });
  return <canvas ref={ref} />;
}

export type TimelinePoint = { x: number; y: number; group: string; tip: string[]; blocked: boolean };

/** One dot per request. Time runs left to right, one row per agent. Hover a dot for the details. */
export function TimelineChart({
  agents,
  points,
  groups,
}: {
  agents: string[];
  points: TimelinePoint[];
  groups: { id: string; label: string; color: string }[];
}) {
  const ref = useChart({
    type: "scatter",
    data: {
      datasets: groups.map((group) => ({
        label: group.label,
        backgroundColor: group.color,
        borderColor: group.color,
        pointRadius: 5,
        pointHoverRadius: 8,
        pointStyle: (context: { raw?: unknown }) => ((context.raw as TimelinePoint | undefined)?.blocked ? "rectRot" : "circle"),
        data: points.filter((point) => point.group === group.id),
      })) as never,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom" },
        tooltip: { callbacks: { label: (item) => (item.raw as TimelinePoint).tip } },
      },
      scales: {
        x: {
          type: "linear",
          ticks: {
            maxTicksLimit: 8,
            callback: (value) => new Date(Number(value)).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric" }),
          },
        },
        y: {
          min: -1,
          max: agents.length,
          ticks: { stepSize: 1, autoSkip: false, callback: (value) => (Number.isInteger(Number(value)) ? agents[Number(value)] ?? "" : "") },
          grid: { display: false },
        },
      },
    },
  });
  return <canvas ref={ref} />;
}
