const segments = [
  { pct: 30, label: "30%", color: "bg-navy-700" },
  { pct: 50, label: "50%", color: "bg-brand-500" },
  { pct: 20, label: "20%", color: "bg-ink-400" },
];

const layers = [
  {
    dot: "bg-navy-700",
    title: "البيانات الرسمية",
    description: "السجل التجاري، حالة الشركة، وعمرها من المصادر الرسمية.",
  },
  {
    dot: "bg-brand-500",
    title: "بيانات المجتمع",
    description:
      "تقارير معتمدة من شركات تعاملت معها فعلياً بشكل موثق ومحقق.",
  },
  {
    dot: "bg-ink-400",
    title: "تقييم المنصة",
    description: "تحليل آلي للأنماط ومؤشرات الالتزام عبر الزمن.",
  },
];

export default function TrustCalculation() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-20 lg:px-10">
      <div className="text-center">
        <h2 className="text-3xl font-extrabold text-ink-900 lg:text-4xl">
          كيف يُحسب مؤشر الثقة؟
        </h2>
        <p className="mt-3 text-ink-500">
          ثلاث طبقات متكاملة تضمن تقييماً متوازناً يصعب التلاعب به
        </p>
      </div>

      <div className="mx-auto mt-12 max-w-4xl rounded-3xl border border-ink-900/8 bg-white p-8 shadow-sm">
        <div className="flex h-12 w-full overflow-hidden rounded-xl">
          {segments.map((segment) => (
            <div
              key={segment.label}
              className={`flex items-center justify-center text-sm font-bold text-white ${segment.color}`}
              style={{ width: `${segment.pct}%` }}
            >
              {segment.label}
            </div>
          ))}
        </div>

        <div className="mt-10 grid gap-8 sm:grid-cols-3">
          {layers.map((layer) => (
            <div key={layer.title} className="text-center sm:text-right">
              <div className="flex items-center justify-center gap-2 sm:justify-start">
                <span className={`h-2.5 w-2.5 rounded-full ${layer.dot}`} />
                <h3 className="text-base font-bold text-ink-900">
                  {layer.title}
                </h3>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-ink-500">
                {layer.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
