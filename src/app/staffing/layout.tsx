import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Vendor Portal — Sajal Tech",
  description: "Staffing company portal to submit and manage resources.",
};

export default function StaffingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
