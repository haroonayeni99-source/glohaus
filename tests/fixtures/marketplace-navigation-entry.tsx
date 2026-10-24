import { createRoot } from "react-dom/client";
import { MarketplaceSidebar, MarketplaceCategoryStrip } from "@/components/marketplace-navigation";

// Populated production category names plus long/extra categories; no live database.
const names = ["Hair", "Nails", "Makeup", "Skin", "Tools", "Fragrance", "Brows", "Lashes", "Hair extensions & accessories", "Professional skincare essentials"];
const categories = names.map((name, index) => ({ id: `11111111-1111-4111-8111-${String(index + 1).padStart(12, "0")}`, name }));
const props = { categories, q: "Oil" };
document.documentElement.dataset.theme = new URLSearchParams(location.search).get("theme") ?? "light";
createRoot(document.getElementById("root")!).render(
  <main className="marketplace-shell">
    <MarketplaceSidebar {...props} />
    <section className="marketplace-main"><MarketplaceCategoryStrip {...props} /></section>
  </main>,
);
