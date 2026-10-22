import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { ApiNotice } from "@/components/ApiNotice";

const navigation = [
  { href: "/", label: "Accueil" },
  { href: "/shipments", label: "Expéditions" },
  { href: "/couriers", label: "Livreurs" },
  { href: "/merchants", label: "Marchands" },
  { href: "/cod", label: "COD" },
  { href: "/settlements", label: "Règlements" },
  { href: "/zones", label: "Zones & tarifs" },
  { href: "/login", label: "Connexion" }
];

export function DashboardShell({ active, children, dir = "ltr", lang = "en" }: { active: string; children: React.ReactNode; dir?: string; lang?: string }) {
  return (
    <main className="shell" dir={dir} lang={lang}>
      <aside className="sidebar">
        <div className="brand">
          <BrandLogo />
        </div>
        <div className="sideLabel" style={{ textAlign: dir === "rtl" ? "right" : "left" }}>{lang === "ar" ? "عمليات الفضاء" : "ESPACE OPÉRATIONS"}</div>
        <nav aria-label="Navigation principale">
          {navigation.map((item) => {
            const label = lang === "ar" ? (
              item.label === "Accueil" ? "الرئيسية" : item.label === "Expéditions" ? "الشحنات" : item.label === "Livreurs" ? "المندوبون" : item.label === "Marchands" ? "التجار" : item.label === "COD" ? "المبالغ المستردة" : item.label === "Règlements" ? "التسويات" : item.label === "Zones & tarifs" ? "المناطق & الأسعار" : item.label === "Connexion" ? "تسجيل الدخول" : item.label
            ) : lang === "fr" ? (
              item.label === "Accueil" ? "Accueil" : item.label === "Expéditions" ? "Expéditions" : item.label === "Livreurs" ? "Livreurs" : item.label === "Marchands" ? "Marchands" : item.label === "COD" ? "COD" : item.label === "Règlements" ? "Règlements" : item.label === "Zones & tarifs" ? "Zones & tarifs" : item.label === "Connexion" ? "Connexion" : item.label
            ) : item.label;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`navItem ${item.label === active ? "active" : ""}`}
                aria-current={item.label === active ? "page" : undefined}
              >
                <span className="navDot" aria-hidden="true" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="sidebarFoot">Foundation · v0.2.0</div>
      </aside>
      <section className="main" dir={dir}>
        <ApiNotice />
        {children}
      </section>
    </main>
  );
}