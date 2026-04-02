import { LiquidGlassCard } from "@/components/liquid-glass";
import { tr } from "motion/react-client";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default function Home() {
  return (
    <div
      className={`${geistSans.className} ${geistMono.className} min-h-screen bg-slate-50 font-sans text-slate-900`}
    >
      <main className="mx-auto w-full max-w-6xl px-6 py-10 md:px-10 lg:py-14 b">
        <section className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200 md:p-12 bg-linear-to-br from-teal-600 to-cyan-700">
          <nav className="mb-10 flex items-center justify-between">
            <div className="text-lg font-semibold tracking-tight">GA Unified</div>
            <Link href="/dashboard" className="rounded-full bg-teal-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-teal-700">
              Go to Dashboard
            </Link>
          </nav>

          <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="mb-3 text-sm font-medium text-teal-700">
                One dashboard for all your analytics
              </p>
              <h1 className="max-w-lg text-4xl font-semibold leading-tight md:text-5xl">
                Track Google Analytics performance in one place.
              </h1>
              <p className="mt-5 max-w-xl text-slate-600">
                Replace tab-hopping with a single, actionable dashboard for
                sessions, conversions, channel performance, and campaign ROI.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <button className="rounded-full bg-slate-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-slate-800">
                  Connect GA4
                </button>
                <button className="rounded-full border border-slate-300 bg-white px-6 py-3 text-sm font-medium text-slate-800 transition hover:bg-slate-100">
                  Watch Demo
                </button>
              </div>
            </div>
            <LiquidGlassCard glowIntensity='sm'
              shadowIntensity='sm'
              borderRadius='12px'
              blurIntensity='sm'
              className="overflow-hidden cursor-auto"
              draggable={true}
            >
              <div className=" text-white relative z-10 p-7">
                <p className="text-sm text-teal-100">Live Performance Snapshot</p>
                <p className="mt-2 text-3xl font-semibold">1,876,560</p>
                <p className="text-sm text-teal-100">Total Monthly Sessions</p>
                <div className="mt-6 grid gap-3">
                  <div className="rounded-xl bg-white/20 p-3">
                    <p className="text-xs text-teal-100">Conversions</p>
                    <p className="text-lg font-semibold">+18.4%</p>
                  </div>
                  <div className="rounded-xl bg-white/20 p-3">
                    <p className="text-xs text-teal-100">Engagement Rate</p>
                    <p className="text-lg font-semibold">67.2%</p>
                  </div>
                  <div className="rounded-xl bg-white/20 p-3">
                    <p className="text-xs text-teal-100">ROAS</p>
                    <p className="text-lg font-semibold">4.9x</p>
                  </div>
                </div>
              </div>
            </LiquidGlassCard>

          </div>
        </section>

        <section className="mt-8 rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200 md:p-10">
          <h2 className="text-2xl font-semibold">Built for growth teams</h2>
          <p className="mt-2 max-w-2xl text-slate-600">
            Monitor traffic quality, funnel leaks, and attribution impact
            without switching tools.
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              {
                title: "Traffic intelligence",
                description:
                  "See channel-level trends and identify where high-intent visitors come from.",
              },
              {
                title: "Conversion mapping",
                description:
                  "Track event performance from landing page to purchase with clear drop-off points.",
              },
              {
                title: "Anomaly alerts",
                description:
                  "Get notified when traffic, conversions, or revenue move outside normal ranges.",
              },
            ].map((feature) => (
              <article
                key={feature.title}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-5"
              >
                <h3 className="text-base font-semibold">{feature.title}</h3>
                <p className="mt-2 text-sm text-slate-600">{feature.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-8 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 md:p-8">
          <h2 className="text-center text-3xl font-semibold">
            Why teams choose GA Unified
          </h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Businesses onboarded", value: "3K+" },
              { label: "Events processed daily", value: "180K" },
              { label: "Average report speed-up", value: "24%" },
              { label: "Connected GA properties", value: "10+" },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center"
              >
                <p className="text-3xl font-semibold text-teal-700">{stat.value}</p>
                <p className="mt-1 text-sm text-slate-600">{stat.label}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-8 rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200 md:p-10">
          <h2 className="text-2xl font-semibold">Realtime Insights Frame</h2>
          <p className="mt-2 max-w-2xl text-slate-600">
            Spot sudden drops and growth spikes across acquisition, retention,
            and conversion in one visual frame.
          </p>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {[
              { title: "Organic Search", value: "+12.3%", tone: "text-emerald-700" },
              { title: "Paid Social", value: "-4.1%", tone: "text-rose-700" },
              { title: "Email Funnels", value: "+9.8%", tone: "text-teal-700" },
            ].map((insight) => (
              <div
                key={insight.title}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-5"
              >
                <p className="text-sm text-slate-600">{insight.title}</p>
                <p className={`mt-2 text-2xl font-semibold ${insight.tone}`}>
                  {insight.value}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-8 rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200 md:p-10">
          <h2 className="text-2xl font-semibold">Attribution Frame</h2>
          <p className="mt-2 max-w-2xl text-slate-600">
            Compare first-touch and last-click impact so your ad budget goes to
            channels that actually drive outcomes.
          </p>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
              <p className="text-sm text-slate-600">Top Assisted Channel</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">
                YouTube Ads
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Assists 31% of all checkout completions.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
              <p className="text-sm text-slate-600">Top Last-Click Channel</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">
                Branded Search
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Closes 44% of high-intent purchases.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-3xl bg-slate-900 p-8 text-white md:p-10">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-semibold">
                Ready to centralize your GA insights?
              </h2>
              <p className="mt-2 text-slate-300">
                Launch your unified dashboard in minutes and start making faster
                marketing decisions.
              </p>
            </div>
            <button className="rounded-full bg-teal-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-teal-400">
              Build My Dashboard
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
