import { useState } from "react";
import { LogoMark } from "./icons";

const navLinks = [
  { label: "الرئيسية", href: "#" },
  { label: "عن المنصة", href: "#about" },
  { label: "الباقات", href: "#pricing" },
  { label: "الأسئلة الشائعة", href: "#faq" },
  { label: "تواصل معنا", href: "#contact" },
];

export default function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-ink-900/5 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-10">
        <a href="#" className="flex items-center gap-2">
          <LogoMark />
          <span className="text-xl font-bold text-ink-900">مرصد</span>
        </a>

        <nav className="hidden items-center gap-8 lg:flex">
          {navLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="text-sm font-medium text-ink-700 transition-colors hover:text-brand-600"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <a
            href="#login"
            className="rounded-full border border-ink-900/15 px-5 py-2 text-sm font-semibold text-ink-900 transition-colors hover:border-ink-900/30"
          >
            تسجيل الدخول
          </a>
          <a
            href="#signup"
            className="rounded-full bg-navy-700 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-navy-600"
          >
            إنشاء حساب
          </a>
        </div>

        <button
          type="button"
          aria-label="فتح القائمة"
          onClick={() => setOpen((v) => !v)}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-ink-900/15 lg:hidden"
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
            <path
              d={open ? "M6 6l12 12M18 6L6 18" : "M4 7h16M4 12h16M4 17h16"}
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {open && (
        <div className="border-t border-ink-900/5 px-6 py-4 lg:hidden">
          <nav className="flex flex-col items-center gap-4">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                onClick={() => setOpen(false)}
                className="text-sm font-medium text-ink-700 hover:text-brand-600"
              >
                {link.label}
              </a>
            ))}
          </nav>
          <div className="mt-5 flex flex-col gap-3">
            <a
              href="#login"
              className="rounded-full border border-ink-900/15 px-5 py-2 text-center text-sm font-semibold text-ink-900"
            >
              تسجيل الدخول
            </a>
            <a
              href="#signup"
              className="rounded-full bg-navy-700 px-5 py-2 text-center text-sm font-semibold text-white"
            >
              إنشاء حساب
            </a>
          </div>
        </div>
      )}
    </header>
  );
}
