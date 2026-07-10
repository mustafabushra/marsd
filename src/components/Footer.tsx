import { LogoMark } from "./icons";

const platformLinks = ["عن المنصة", "الباقات", "كيف نعمل"];
const legalLinks = ["سياسة الخصوصية", "الشروط والأحكام", "حماية بيانات المُبلغين"];

export default function Footer() {
  return (
    <footer className="bg-navy-950">
      <div className="mx-auto max-w-7xl px-6 py-14 lg:px-10">
        <div className="grid gap-10 sm:grid-cols-3">
          <div className="text-center sm:text-right">
            <div className="flex items-center justify-center gap-2 sm:justify-start">
              <span className="text-lg font-bold text-white">مرصد</span>
              <LogoMark />
            </div>
            <p className="mt-4 text-sm leading-relaxed text-white/50">
              المرجع الموثوق لتقييم موثوقية شركاء الأعمال في السوق السعودي
              والخليجي.
            </p>
          </div>

          <div className="text-center sm:text-right">
            <h4 className="text-sm font-bold text-white">المنصة</h4>
            <ul className="mt-4 space-y-3">
              {platformLinks.map((link) => (
                <li key={link}>
                  <a
                    href="#"
                    className="text-sm text-white/50 transition-colors hover:text-white"
                  >
                    {link}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div className="text-center sm:text-right">
            <h4 className="text-sm font-bold text-white">قانوني</h4>
            <ul className="mt-4 space-y-3">
              {legalLinks.map((link) => (
                <li key={link}>
                  <a
                    href="#"
                    className="text-sm text-white/50 transition-colors hover:text-white"
                  >
                    {link}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-white/10 pt-6 text-center">
          <p className="text-xs text-white/40">
            © مرصد 2026 جميع الحقوق محفوظة
          </p>
        </div>
      </div>
    </footer>
  );
}
