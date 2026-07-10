import { ChartIcon, HeartHandIcon, SearchIcon } from "./icons";

const steps = [
  {
    number: "1",
    icon: SearchIcon,
    title: "ابحث عن الشركة",
    description:
      "ابحث بالاسم أو رقم السجل التجاري للوصول لملف الشركة فوراً.",
  },
  {
    number: "2",
    icon: ChartIcon,
    title: "اطلع على تقرير الموثوقية",
    description:
      "استعرض مؤشر الثقة، مستوى المخاطر ومؤشرات الالتزام بالسداد.",
  },
  {
    number: "3",
    icon: HeartHandIcon,
    title: "ساهم بتقاريرك المعتمدة",
    description:
      "أضف تقاريرك عن تعاملاتك لتستفيد من تقارير الآخرين.",
  },
];

export default function HowItWorks() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-20 lg:px-10">
      <div className="text-center">
        <h2 className="text-3xl font-extrabold text-ink-900 lg:text-4xl">
          كيف تعمل المنصة؟
        </h2>
        <p className="mt-3 text-ink-500">
          ثلاث خطوات تفصلك عن قرار تجاري أكثر أماناً
        </p>
      </div>

      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {steps.map((step) => (
          <div
            key={step.number}
            className="rounded-2xl border border-ink-900/8 bg-white p-6 shadow-sm"
          >
            <div className="flex items-start justify-between">
              <span className="text-4xl font-extrabold text-ink-900/10">
                {step.number}
              </span>
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <step.icon className="h-5 w-5" />
              </span>
            </div>
            <h3 className="mt-4 text-lg font-bold text-ink-900">
              {step.title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-500">
              {step.description}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
