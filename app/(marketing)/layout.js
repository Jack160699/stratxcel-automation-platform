import { Navbar } from "../components/Navbar";
import { SiteFooter } from "../components/SiteFooter";
import { COLORS } from "@/lib/constants";

export default function MarketingLayout({ children }) {
  return (
    <div
      className="relative flex min-h-screen flex-col text-[#0B1220]"
      style={{ backgroundColor: COLORS.surface }}
    >
      <Navbar />
      <main className="relative flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
