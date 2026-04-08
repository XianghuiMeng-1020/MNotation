import { Bar } from "react-chartjs-2";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from "chart.js";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

export function BarChart({ labels, values, title }: { labels: string[]; values: number[]; title: string }) {
  const data = {
    labels,
    datasets: [{ label: title, data: values, backgroundColor: "#6366f1" }]
  };
  return <Bar data={data} />;
}
