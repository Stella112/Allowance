import type { Metadata } from "next";
import DemoApp from "./DemoApp";

export const metadata: Metadata = {
  title: "Adeyemi family demo · Allowance",
  description: "Live the night shift in two minutes: real Base transactions, tiny amounts paid by Allowance.",
};

export default function DemoPage() {
  return <DemoApp />;
}
