import TrustScoreCard from "./TrustScoreCard";

const stats = [
  { value: "+12,400", label: "شركة مُقيّمة" },
  { value: "+38,900", label: "تقرير معتمد" },
  { value: "99.2%", label: "دقة البيانات الرسمية" },
];

export default function Hero() {
  return (
    <section className="mx-auto max-w-7xl px-6 pt-16 pb-20 lg:px-10 lg:pt-24">
      <div className="grid items-center gap-16 lg:grid-cols-2">
        <div className="text-center lg:text-right">
          <span className="inline-block rounded-full bg-brand-50 px-4 py-1.5 text-sm font-semibold text-brand-700">
            منصة متخصصة لتقييم موثوقية الأعمال
          </span>

          <h1 className="mt-5 text-4xl font-extrabold leading-[1.25] text-ink-900 lg:text-5xl">
            اعرف موثوقية شركائك التجاريين قبل التعامل معهم
          </h1>

          <p className="mt-5 text-lg leading-relaxed text-ink-500">
            منصة "مرصد" تمنحك مؤشر ثقة موحّداً ومستوى مخاطر دقيق لكل شركة.
            مبني على بيانات رسمية وتقارير مجتمعية مُعتمدة. تعامل بثقة، وقلّل
            المخاطر.
          </p>

          <div className="mt-8 flex flex-col-reverse items-center justify-center gap-3 sm:flex-row lg:justify-start">
            <button className="w-full rounded-full border border-ink-900/15 px-6 py-3 text-sm font-semibold text-ink-900 transition-colors hover:border-ink-900/30 sm:w-auto">
              شاهد كيف تعمل
            </button>
            <button className="w-full rounded-full bg-brand-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-500/25 transition-colors hover:bg-brand-600 sm:w-auto">
              ابدأ مجاناً
            </button>
          </div>

          <div className="mt-12 grid grid-cols-3 gap-6 border-t border-ink-900/10 pt-8">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center lg:text-right">
                <p className="text-2xl font-extrabold text-ink-900 lg:text-3xl">
                  {stat.value}
                </p>
                <p className="mt-1 text-xs font-medium text-ink-500 lg:text-sm">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-center lg:justify-start">
          <TrustScoreCard />
        </div>
      </div>
    </section>
  );
}
