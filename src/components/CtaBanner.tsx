export default function CtaBanner() {
  return (
    <section className="mx-auto max-w-7xl px-6 pb-20 lg:px-10">
      <div className="rounded-3xl bg-brand-500 px-8 py-14 text-center">
        <h2 className="text-2xl font-extrabold text-white lg:text-3xl">
          جاهز لاتخاذ قرارات تجارية أكثر أماناً؟
        </h2>
        <p className="mt-3 text-white/85">
          انضم لآلاف الشركات التي تعتمد على "مرصد" قبل كل تعامل
        </p>
        <button className="mt-7 rounded-full bg-white px-7 py-3 text-sm font-bold text-brand-600 shadow-lg transition-transform hover:scale-[1.02]">
          أنشئ حسابك المجاني
        </button>
      </div>
    </section>
  );
}
