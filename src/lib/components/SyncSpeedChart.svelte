<script lang="ts">
  import { Chart, registerables } from "chart.js";
  import { onDestroy, onMount } from "svelte";
  import "chartjs-adapter-date-fns";

  // Register Chart.js components
  Chart.register(...registerables);

  interface DataPoint {
    timestamp: number;
    tracksPerSecond: number;
  }

  interface Props {
    data: DataPoint[];
    height?: string;
    width?: string;
  }

  const { data, height = "300px", width = "100%" }: Props = $props();

  let canvas: HTMLCanvasElement;
  let chart: Chart | null = null;

  onMount(() => {
    if (!canvas)
      return;

    const ctx = canvas.getContext("2d");
    if (!ctx)
      return;

    chart = new Chart(ctx, {
      type: "line",
      data: {
        datasets: [
          {
            label: "Tracks/sec",
            data: data.map(point => ({
              x: point.timestamp,
              y: point.tracksPerSecond,
            })),
            borderColor: "rgb(59, 130, 246)",
            backgroundColor: "rgba(59, 130, 246, 0.1)",
            borderWidth: 2,
            fill: true,
            tension: 0,
            pointRadius: 3,
            pointHoverRadius: 5,
            pointBackgroundColor: "rgb(59, 130, 246)",
            pointBorderColor: "rgb(30, 41, 59)",
            pointBorderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          intersect: false,
          mode: "index",
        },
        scales: {
          x: {
            type: "time",
            time: {
              unit: "second",
              displayFormats: {
                second: "HH:mm:ss",
              },
            },
            title: {
              display: true,
              text: "Time",
              color: "rgb(148, 163, 184)",
            },
            grid: {
              color: "rgba(148, 163, 184, 0.2)",
            },
            ticks: {
              color: "rgb(148, 163, 184)",
            },
          },
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: "Tracks per Second",
              color: "rgb(148, 163, 184)",
            },
            grid: {
              color: "rgba(148, 163, 184, 0.2)",
            },
            ticks: {
              color: "rgb(148, 163, 184)",
            },
          },
        },
        plugins: {
          legend: {
            display: true,
            position: "top",
            labels: {
              color: "rgb(148, 163, 184)",
            },
          },
          tooltip: {
            backgroundColor: "rgb(30, 41, 59)",
            titleColor: "rgb(148, 163, 184)",
            bodyColor: "rgb(148, 163, 184)",
            borderColor: "rgb(71, 85, 105)",
            borderWidth: 1,
            callbacks: {
              title: (context) => {
                const date = new Date(context[0].parsed.x);
                return date.toLocaleTimeString();
              },
              label: (context) => {
                return `Speed: ${context.parsed.y.toFixed(2)} tracks/sec`;
              },
            },
          },
        },
      },
    });
  });

  // Update chart when data changes
  $effect(() => {
    if (chart && data.length > 0) {
      chart.data.datasets[0].data = data.map(point => ({
        x: point.timestamp,
        y: point.tracksPerSecond,
      }));
      chart.update("none");
    }
  });

  onDestroy(() => {
    if (chart) {
      chart.destroy();
      chart = null;
    }
  });
</script>

<div class="chart-container" style="height: {height}; width: {width};">
  <canvas bind:this={canvas}></canvas>
</div>

<style>
  .chart-container {
    position: relative;
    background: rgb(30, 41, 59);
    border-radius: 8px;
    padding: 16px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  }
</style>
