import Link from "next/link";
import type { ReactNode } from "react";
import {
  Globe,
  RefreshCw,
  Layers,
  Package,
  Heart,
  Terminal,
  Code2,
  Hexagon,
  Coffee,
  Gem,
  Cog,
  Shield,
} from "lucide-react";

const languages: { name: string; icon: ReactNode; color: string; href: string }[] = [
  {
    name: "Python",
    icon: <Terminal className="h-8 w-8" />,
    color: "text-sky-500",
    href: "/docs/languages/python",
  },
  {
    name: "JavaScript",
    icon: <Code2 className="h-8 w-8" />,
    color: "text-yellow-500",
    href: "/docs/languages/javascript",
  },
  {
    name: "Go",
    icon: <Hexagon className="h-8 w-8" />,
    color: "text-cyan-500",
    href: "/docs/languages/go",
  },
  {
    name: "Rust",
    icon: <Cog className="h-8 w-8" />,
    color: "text-orange-500",
    href: "/docs/languages/rust",
  },
  {
    name: "Java",
    icon: <Coffee className="h-8 w-8" />,
    color: "text-red-500",
    href: "/docs/languages/java",
  },
  {
    name: "Ruby",
    icon: <Gem className="h-8 w-8" />,
    color: "text-rose-500",
    href: "/docs/languages/ruby",
  },
  {
    name: "PHP",
    icon: <Shield className="h-8 w-8" />,
    color: "text-indigo-500",
    href: "/docs/languages/php",
  },
  {
    name: ".NET",
    icon: <Globe className="h-8 w-8" />,
    color: "text-purple-500",
    href: "/docs/languages/dotnet",
  },
];

const features: { title: string; description: string; icon: ReactNode; color: string }[] = [
  {
    title: "One API, Every Language",
    description:
      "Identical load() → Config interface across Python, JavaScript, Go, Rust, Java, Ruby, PHP, and .NET.",
    icon: <Globe className="h-7 w-7" />,
    color: "text-blue-500",
  },
  {
    title: "Automatic Type Coercion",
    description:
      'Strings like "true", "8080", "3.14" are automatically coerced to booleans, integers, and floats.',
    icon: <RefreshCw className="h-7 w-7" />,
    color: "text-emerald-500",
  },
  {
    title: "Layered Priority",
    description:
      "Environment variables → .env files → YAML/JSON → TOML → defaults. Higher layers win.",
    icon: <Layers className="h-7 w-7" />,
    color: "text-amber-500",
  },
  {
    title: "Zero Dependencies",
    description:
      "Core implementations have zero required dependencies. Optional parsers degrade gracefully.",
    icon: <Package className="h-7 w-7" />,
    color: "text-violet-500",
  },
];

export default function HomePage() {
  return (
    <main className="flex flex-col items-center">
      {/* Hero */}
      <section className="relative flex w-full flex-col items-center justify-center overflow-hidden px-6 py-24 text-center md:py-36">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-fd-primary/5 to-transparent" />
        <div className="mb-4 inline-flex items-center rounded-full border border-fd-primary/20 bg-fd-primary/5 px-4 py-1.5 text-sm font-medium text-fd-primary">
          v0.1.0 — Now in 8 Languages
        </div>
        <h1 className="max-w-4xl text-4xl font-extrabold tracking-tight md:text-6xl lg:text-7xl">
          Your config.{" "}
          <span className="bg-gradient-to-r from-fd-primary to-purple-500 bg-clip-text text-transparent">
            Conducted.
          </span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-fd-muted-foreground md:text-xl">
          One call to load <code className="rounded bg-fd-muted px-1.5 py-0.5 text-sm font-mono">.env</code>,
          YAML, JSON, TOML, and environment variables — with automatic type coercion
          and layered priority merging.
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/docs"
            className="inline-flex items-center rounded-lg bg-fd-primary px-6 py-3 text-sm font-semibold text-fd-primary-foreground shadow-lg transition-all hover:opacity-90"
          >
            Get Started →
          </Link>
          <Link
            href="/docs/api/load"
            className="inline-flex items-center rounded-lg border border-fd-border bg-fd-card px-6 py-3 text-sm font-semibold transition-all hover:bg-fd-accent"
          >
            API Reference
          </Link>
        </div>

        {/* Code preview */}
        <div className="mt-14 w-full max-w-2xl overflow-hidden rounded-xl border border-fd-border bg-fd-card shadow-2xl">
          <div className="flex items-center gap-2 border-b border-fd-border px-4 py-3">
            <div className="h-3 w-3 rounded-full bg-red-400" />
            <div className="h-3 w-3 rounded-full bg-yellow-400" />
            <div className="h-3 w-3 rounded-full bg-green-400" />
            <span className="ml-2 text-xs text-fd-muted-foreground font-mono">app.py</span>
          </div>
          <pre className="overflow-x-auto p-6 text-left text-sm leading-relaxed">
            <code>
              <span className="text-purple-400">from</span>{" "}
              <span className="text-blue-400">dotlyte</span>{" "}
              <span className="text-purple-400">import</span>{" "}
              <span className="text-blue-400">load</span>{"\n\n"}
              <span className="text-fd-muted-foreground"># One call. All your config.</span>{"\n"}
              <span className="text-yellow-400">config</span>{" "}
              <span className="text-fd-muted-foreground">=</span>{" "}
              <span className="text-blue-400">load</span>
              <span className="text-fd-muted-foreground">()</span>{"\n\n"}
              <span className="text-yellow-400">config</span>
              <span className="text-fd-muted-foreground">.</span>
              <span className="text-green-400">port</span>
              {"          "}
              <span className="text-fd-muted-foreground"># → 8080 (auto-coerced int)</span>{"\n"}
              <span className="text-yellow-400">config</span>
              <span className="text-fd-muted-foreground">.</span>
              <span className="text-green-400">debug</span>
              {"         "}
              <span className="text-fd-muted-foreground"># → True (auto-coerced bool)</span>{"\n"}
              <span className="text-yellow-400">config</span>
              <span className="text-fd-muted-foreground">.</span>
              <span className="text-blue-400">get</span>
              <span className="text-fd-muted-foreground">(</span>
              <span className="text-green-400">&quot;db.host&quot;</span>
              <span className="text-fd-muted-foreground">)</span>
              {"  "}
              <span className="text-fd-muted-foreground"># → &quot;localhost&quot; (nested access)</span>
            </code>
          </pre>
        </div>
      </section>

      {/* Features */}
      <section className="w-full max-w-6xl px-6 py-20">
        <h2 className="text-center text-3xl font-bold tracking-tight md:text-4xl">
          Why DOTLYTE?
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-fd-muted-foreground">
          Stop writing config boilerplate. DOTLYTE gives you a universal, type-safe
          configuration API that works the same way in every language.
        </p>
        <div className="mt-14 grid gap-6 md:grid-cols-2">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-xl border border-fd-border bg-fd-card p-6 transition-all hover:shadow-lg hover:border-fd-primary/30"
            >
              <div className={`mb-4 ${f.color}`}>{f.icon}</div>
              <h3 className="text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-fd-muted-foreground leading-relaxed">
                {f.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Languages Grid */}
      <section className="w-full max-w-6xl px-6 py-20">
        <h2 className="text-center text-3xl font-bold tracking-tight md:text-4xl">
          8 Languages. One API.
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-fd-muted-foreground">
          Every implementation follows the same spec. Learn once, use everywhere.
        </p>
        <div className="mt-14 grid grid-cols-2 gap-4 md:grid-cols-4">
          {languages.map((lang) => (
            <Link
              key={lang.name}
              href={lang.href}
              className="flex flex-col items-center rounded-xl border border-fd-border bg-fd-card p-6 transition-all hover:shadow-lg hover:border-fd-primary/30 hover:-translate-y-1"
            >
              <span className={lang.color}>{lang.icon}</span>
              <span className="mt-3 font-semibold">{lang.name}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="w-full px-6 py-20 text-center">
        <div className="mx-auto max-w-2xl rounded-2xl border border-fd-border bg-gradient-to-b from-fd-primary/5 to-fd-card p-12">
          <h2 className="text-3xl font-bold">Ready to simplify your config?</h2>
          <p className="mt-4 text-fd-muted-foreground">
            Pick your language and start loading configuration in under 5 minutes.
          </p>
          <Link
            href="/docs/getting-started"
            className="mt-8 inline-flex items-center rounded-lg bg-fd-primary px-8 py-3 text-sm font-semibold text-fd-primary-foreground shadow-lg transition-all hover:opacity-90"
          >
            Get Started →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="w-full border-t border-fd-border px-6 py-8 text-center text-sm text-fd-muted-foreground">
        <p>MIT Licensed · Built with <Heart className="inline h-4 w-4 text-red-500 fill-red-500" /> by the DOTLYTE Contributors</p>
      </footer>
    </main>
  );
}
