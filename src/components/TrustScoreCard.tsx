export default function TrustScoreCard() {
  const score = 94;
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;

  return (
    <div className="w-full max-w-sm rounded-3xl border border-ink-900/5 bg-white p-6 shadow-[0_20px_50px_-15px_rgba(15,23,42,0.15)]">
      <p className="text-center text-sm font-semibold text-ink-700">
        مؤشر الثقة
      </p>

      <div className="relative mx-auto mt-4 flex h-52 w-52 items-center justify-center">
        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
          <circle
            cx={60}
            cy={60}
            r={radius}
            fill="none"
            stroke="#E7EAF0"
            strokeWidth={10}
          />
          <circle
            cx={60}
            cy={60}
            r={radius}
            fill="none"
            stroke="#1EA866"
            strokeWidth={10}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference - progress}
          />
        </svg>
        <div className="absolute flex flex-col items-center">
          <span className="text-5xl font-extrabold text-ink-900">{score}</span>
          <span className="text-xs font-medium text-ink-500">من 100</span>
        </div>
      </div>

      <div className="mt-4 flex justify-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-600" />
          موثوقية عالية
        </span>
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-ink-500">
            نسبة الالتزام بالسداد
          </span>
          <span className="font-bold text-ink-900">96%</span>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-ink-900/10">
          <div
            className="h-full rounded-full bg-brand-500"
            style={{ width: "96%" }}
          />
        </div>
      </div>
    </div>
  );
}
