import type { Metadata } from "next";
import {ProgressExperience} from "@/components/progress-experience";

export const metadata: Metadata = { title: "Tổng quan | Nihongo Quest" };

export default function Dashboard() {
  return <ProgressExperience view="dashboard"/>;
}
