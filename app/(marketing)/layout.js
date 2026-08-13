import { PublicFooter } from "../components/PublicFooter";
import { PublicHeader } from "../components/PublicHeader";

export default function MarketingLayout({ children }) {
  return (
    <div className="sx-public-theme flex min-h-screen flex-col overflow-x-hidden bg-sx-bg font-sx-sans text-sx-text antialiased">
      <PublicHeader logoVariant="light" />
      <main className="flex-1">{children}</main>
      <PublicFooter logoVariant="light" />
    </div>
  );
}
