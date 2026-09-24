import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

// A receipt screwed up into a ball, a torn tail with a few printed lines still sticking out.
function CrumpledSlip() {
  return (
    <svg viewBox="0 0 200 150" className="h-auto w-56 text-ink sm:w-64" fill="none" stroke="currentColor" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
      {/* The tail: a strip of the slip, torn edge at its end, printed lines on it. */}
      <path d="M118 92 L170 104 L166 122 L161 117 L156 122 L151 117 L146 121 L141 116 L136 120 L112 112 Z" className="fill-paper" strokeWidth="1.6" />
      <path d="M124 100 l30 7 M122 106 l20 4.5" strokeWidth="2.2" strokeDasharray="3 2" />
      {/* The ball, faceted like crushed paper. */}
      <path
        d="M58 30 L92 16 L128 26 L146 52 L142 86 L120 112 L84 120 L52 108 L34 80 L38 48 Z"
        className="fill-paper"
        strokeWidth="1.8"
      />
      <path
        d="M92 16 L86 44 L58 30 M86 44 L128 26 M86 44 L110 62 L146 52 M110 62 L142 86 M110 62 L102 92 L120 112 M102 92 L84 120 M102 92 L66 84 L52 108 M66 84 L34 80 M66 84 L64 58 L38 48 M64 58 L86 44 M64 58 L110 62"
        strokeWidth="1"
      />
      {/* Scraps of print on the crushed surface. */}
      <path d="M70 66 l14 1 M72 71 l9 0.5 M112 76 l12 -3 M92 102 l8 -1" strokeWidth="1.8" strokeDasharray="2.5 1.5" />
      {/* Its shadow on the counter. */}
      <path d="M44 132 Q100 140 164 130" strokeWidth="1" strokeDasharray="1 3" />
    </svg>
  );
}

export default function NotFound() {
  const t = useTranslations("NotFound");
  return (
    <main id="main" className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-8 px-4 py-16 sm:px-6">
      <CrumpledSlip />
      <div className="flex flex-col items-center gap-3 text-center">
        <p className="font-mono text-sm font-bold tracking-[0.2em]">404</p>
        <h1 className="text-2xl font-bold text-balance sm:text-3xl">{t("title")}</h1>
        <p className="max-w-[48ch] leading-relaxed">{t("text")}</p>
        <Link href="/" className="mt-2 font-semibold underline underline-offset-4">
          {t("back")}
        </Link>
      </div>
    </main>
  );
}
