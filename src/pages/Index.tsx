import { Link } from "react-router-dom";
import { Shield, Phone, Mail, MapPin } from "lucide-react";
import { useLanguage } from "@/lib/i18n";

export const Footer = () => {
  const { t } = useLanguage();

  return (
    <footer className="bg-primary text-primary-foreground mt-20 border-t border-primary/20">
      <div className="container-full py-12 md:py-16 grid grid-cols-1 md:grid-cols-4 gap-8">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-accent text-accent-foreground flex items-center justify-center font-bold">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <span className="font-bold text-xl tracking-tight text-white">AZ-CCTV</span>
          </div>
          <p className="text-sm text-primary-foreground/75 leading-relaxed">
            {t("aboutText")}
          </p>
        </div>

        <div>
          <h4 className="font-semibold text-sm mb-4 text-accent uppercase tracking-wider">
            {t("quickLinks")}
          </h4>
          <ul className="space-y-2 text-sm text-primary-foreground/80">
            <li><Link to="/" className="hover:text-accent transition-colors">{t("navHome")}</Link></li>
            <li><Link to="/products" className="hover:text-accent transition-colors">{t("navProducts")}</Link></li>
            <li><Link to="/products?section=cctv" className="hover:text-accent transition-colors">{t("navCctv")}</Link></li>
            <li><Link to="/products?section=network" className="hover:text-accent transition-colors">{t("navNetwork")}</Link></li>
            <li><Link to="/about" className="hover:text-accent transition-colors">{t("navAbout")}</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="font-semibold text-sm mb-4 text-accent uppercase tracking-wider">
            {t("contactUs")}
          </h4>
          <ul className="space-y-2.5 text-sm text-primary-foreground/80">
            <li className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-accent" />
              <span dir="ltr">+20 100 000 0000</span>
            </li>
            <li className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-accent" />
              <span>sales@alazab.store</span>
            </li>
            <li className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-accent" />
              <span>القاهرة / الجيزة - جمهورية مصر العربية</span>
            </li>
          </ul>
        </div>

        <div className="bg-primary-foreground/5 p-4 rounded-lg border border-primary-foreground/10">
          <h4 className="font-bold text-sm text-accent mb-2">{t("whyGenuine")}</h4>
          <p className="text-xs text-primary-foreground/70 leading-relaxed mb-3">
            {t("whyGenuineText")}
          </p>
          <span className="text-xs font-semibold text-accent block">
            {t("whyDeliveryText")}
          </span>
        </div>
      </div>

      <div className="border-t border-primary-foreground/10 py-4 text-center text-xs text-primary-foreground/60">
        © {new Date().getFullYear()} AZ-CCTV. {t("rights")}.
      </div>
    </footer>
  );
};
