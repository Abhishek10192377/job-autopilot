import type { ReactNode } from "react";
import { Shell } from "@/client/Shell";

export default function AppLayout({ children }: { children: ReactNode }) {
  return <Shell>{children}</Shell>;
}
