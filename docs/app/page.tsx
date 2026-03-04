"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useState } from "react";
import {
  Globe,
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
  ChevronRight,
  Sparkles,
  Zap,
  Settings,
  ArrowRight
} from "lucide-react";

const languages: { name: string; icon: ReactNode; color: string; href: string; bg: string }[] = [
  {
    name: "Python",
    icon: <Terminal className="h-6 w-6" />,
    color: "text-sky-500",
    bg: "bg-sky-500/10",
    href: "/docs/languages/python",
  },
  {
    name: "JavaScript",
    icon: <Code2 className="h-6 w-6" />,
    color: "text-yellow-500",
    bg: "bg-yellow-500/10",
    href: "/docs/languages/javascript",
  },
  {
    name: "Go",
    icon: <Hexagon className="h-6 w-6" />,
    color: "text-cyan-500",
    bg: "bg-cyan-500/10",
    href: "/docs/languages/go",
  },
  {
    name: "Rust",
    icon: <Cog className="h-6 w-6" />,
    color: "text-orange-500",
    bg: "bg-orange-500/10",
    href: "/docs/languages/rust",
  },
  {
    name: "Java",
    icon: <Coffee className="h-6 w-6" />,
    color: "text-red-500",
    bg: "bg-red-500/10",
    href: "/docs/languages/java",
  },
  {
    name: "Ruby",
    icon: <Gem className="h-6 w-6" />,
    color: "text-rose-500",
    bg: "bg-rose-500/10",
    href: "/docs/languages/ruby",
  },
  {
    name: "PHP",
    icon: <Shield className="h-6 w-6" />,
    color: "text-indigo-500",
    bg: "bg-indigo-500/10",
    href: "/docs/languages/php",
  },
  {
    name: ".NET",
    icon: <Globe className="h-6 w-6" />,
    color: "text-purple-500",
    bg: "bg-purple-500/10",
    href: "/docs/languages/dotnet",
  },
];

const features = [
  {
    title: "One API, Every Language",
    description:
      "Identical `load() → Config` interface across Python, JavaScript, Go, Rust, Java, Ruby, PHP, and .NET. Switch languages, not syntax.",
    icon: <Globe className="h-5 w-5" />,
    color: "text-fd-foreground",
    bg: "bg-fd-muted",
    border: "border-fd-border",
  },
  {
    title: "Automatic Type Coercion",
    description:
      "Strings like \"true\", \"8080\", and \"3.14\" from .env files are automatically and safely coerced to actual booleans, integers, and floats.",
    icon: <Zap className="h-5 w-5" />,
    color: "text-fd-foreground",
    bg: "bg-fd-muted",
    border: "border-fd-border",
  },
  {
    title: "Layered Priority Merging",
    description:
      "Environment Variables overrides .env files, which overrides YAML/JSON, which overrides TOML, giving you absolute control across environments.",
    icon: <Layers className="h-5 w-5" />,
    color: "text-fd-foreground",
    bg: "bg-fd-muted",
    border: "border-fd-border",
  },
  {
    title: "Zero Dependencies",
    description:
      "Core implementations have absolute zero required dependencies. Keep your deployments light. Optional parsers degrade gracefully.",
    icon: <Package className="h-5 w-5" />,
    color: "text-fd-foreground",
    bg: "bg-fd-muted",
    border: "border-fd-border",
  },
];

const codeSamples: Record<string, string[]> = {
  Python: [
    "from dotlyte import load",
    "",
    "# One call. All your config loaded & merged.",
    "config = load()",
    "",
    "port = config.port        # → 8080 (int)",
    "debug = config.debug      # → True (bool)",
    'host = config.get("db.host", "localhost")',
  ],
  JavaScript: [
    "import { load } from \"dotlyte\";",
    "",
    "// One call. All your config loaded & merged.",
    "const config = load();",
    "",
    "const port = config.port;     // 8080 (number)",
    "const debug = config.debug;   // true (boolean)",
    'const host = config.get("db.host", "localhost");',
  ],
  Go: [
    'package main',
    "",
    'import "github.com/dotlyte/dotlyte/langs/go"',
    "",
    "func main() {",
    "  cfg, _ := dotlyte.Load(nil)",
    "  _ = cfg.Get(\"db.host\", \"localhost\")",
    "}",
  ],
  Rust: [
    "use dotlyte::load;",
    "",
    "fn main() {",
    "    let config = load(None).unwrap();",
    "    let port = config.get(\"port\", Some(\"8080\"));",
    "    println!(\"{:?}\", port);",
    "}",
  ],
  Java: [
    "import io.dotlyte.Dotlyte;",
    "",
    "var config = Dotlyte.load();",
    "var port = config.get(\"port\", 8080);",
    "var debug = config.get(\"debug\", false);",
  ],
  Ruby: [
    "require \"dotlyte\"",
    "",
    "config = Dotlyte.load",
    "port = config.port",
    "debug = config.debug",
    "host = config.get(\"db.host\", \"localhost\")",
  ],
  PHP: [
    "<?php",
    "",
    "use Dotlyte\\Dotlyte;",
    "$config = Dotlyte::load();",
    "$port = $config->get('port', 8080);",
    "$host = $config->get('db.host', 'localhost');",
  ],
  ".NET": [
    "using Dotlyte;",
    "",
    "var config = DotlyteLoader.Load();",
    "var port = config.Get<int>(\"port\", 8080);",
    "var debug = config.Get<bool>(\"debug\", false);",
  ],
};

export default function HomePage() {
  const [activeLanguage, setActiveLanguage] = useState<keyof typeof codeSamples>("Python");

  return (
    <main className="flex min-h-screen flex-col items-center overflow-x-hidden bg-fd-background selection:bg-fd-primary/30">
      {/* Dynamic Background */}
      <div className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center bg-fd-background">
        <div className="absolute top-[-20%] left-[-10%] h-[500px] w-[500px] rounded-full bg-purple-500/10 blur-[120px]" />
        <div className="absolute top-[20%] right-[-10%] h-[400px] w-[400px] rounded-full bg-sky-400/10 blur-[100px]" />
        <div className="absolute bottom-[-20%] left-[25%] h-[320px] w-[320px] rounded-full bg-orange-400/10 blur-[100px]" />
      </div>

      {/* Hero Section */}
      <section className="relative w-full max-w-6xl px-6 pt-28 pb-20 text-center md:pt-40 md:pb-24">
        <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 mx-auto flex flex-col items-center">
          
          <Link
            href="/docs"
            className="mb-7 flex items-center gap-2 rounded-full border border-fd-primary/30 bg-fd-primary/10 px-4 py-1.5 text-xs font-medium text-fd-primary"
          >
            <Sparkles className="h-4 w-4" />
            <span>
              <span className="text-purple-600">DOTLYTE v0.1.1</span>
              <span className="text-fd-muted-foreground"> · </span>
              <span className="text-sky-600">MIT Open Source</span>
              <span className="text-fd-muted-foreground"> · </span>
              <span className="text-orange-500">8 Languages</span>
            </span>
            <ChevronRight className="h-4 w-4" />
          </Link>

          <h1 className="max-w-4xl text-3xl font-extrabold tracking-tight sm:text-4xl md:text-5xl">
            <span className="bg-gradient-to-r from-purple-600 via-sky-600 to-orange-500 bg-clip-text text-transparent">
              Configuration, Mastered.
            </span>
          </h1>

          <p className="mt-6 max-w-2xl text-sm font-medium text-fd-muted-foreground sm:text-base leading-relaxed">
            One robust API to load <code className="rounded-md bg-fd-muted px-1.5 py-0.5 font-mono text-sm">.env</code>, YAML, JSON, TOML, and env vars. Featuring automatic type coercion and layered priority merging.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/docs/getting-started"
              className="inline-flex items-center gap-2 rounded-full bg-fd-foreground px-7 py-3 text-xs font-bold text-fd-background sm:text-sm"
            >
              <span>Start Building</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/docs/api/load"
              className="inline-flex items-center gap-2 rounded-full border border-fd-border bg-fd-card px-7 py-3 text-xs font-bold text-fd-foreground sm:text-sm"
            >
              <Settings className="h-4 w-4 text-fd-muted-foreground" />
              API Reference
            </Link>
          </div>
        </div>

        {/* Floating Code UI */}
        <div className="animate-in fade-in slide-in-from-bottom-12 duration-1000 mt-16 mx-auto w-full max-w-3xl">
          <div className="overflow-hidden rounded-2xl border-2 border-zinc-300 bg-white">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-fd-border bg-fd-muted px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-red-500/80" />
                <div className="h-3 w-3 rounded-full bg-yellow-500/80" />
                <div className="h-3 w-3 rounded-full bg-green-500/80" />
                <span className="ml-2 text-[11px] font-semibold text-fd-foreground">{activeLanguage}</span>
              </div>
              <div className="flex max-w-[72%] flex-wrap justify-end gap-1.5">
                {languages.map((lang) => (
                  <button
                    key={lang.name}
                    type="button"
                    onClick={() => setActiveLanguage(lang.name as keyof typeof codeSamples)}
                    className={`rounded border px-1.5 py-0.5 text-[10px] uppercase font-bold tracking-wider ${
                      activeLanguage === lang.name
                        ? "border-purple-300 bg-purple-100 text-purple-700"
                        : "border-zinc-300 text-zinc-600"
                    }`}
                  >
                    {lang.name}
                  </button>
                ))}
              </div>
            </div>
            {/* Code Body */}
            <div className="min-h-[250px] p-7 sm:p-8">
              <pre className="whitespace-pre-wrap break-words text-left font-mono text-sm leading-loose text-zinc-900 sm:text-base">
                <code>
                  {codeSamples[activeLanguage].map((line, index) => (
                    <span key={`${activeLanguage}-${index}`} className="block">
                      {line === "" ? "\u00A0" : line}
                    </span>
                  ))}
                </code>
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* Languages Banner */}
      <section className="w-full border-y border-fd-border/50 bg-fd-card/30 py-9">
        <div className="mx-auto flex max-w-6xl flex-col items-center px-6">
          <p className="text-xs font-semibold tracking-widest text-fd-muted-foreground uppercase">Supported Across All Major Ecosystems</p>
          <div className="mt-8 flex flex-wrap justify-center gap-6 sm:gap-10">
            {languages.map((lang) => (
              <Link href={lang.href} key={lang.name} className="flex flex-col items-center gap-2">
                <div className={`p-4 rounded-2xl border border-fd-border bg-fd-card ${lang.color} ${lang.bg}`}>
                  {lang.icon}
                </div>
                <span className="text-[11px] font-medium text-fd-muted-foreground">{lang.name}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Features Bento Grid */}
      <section className="w-full max-w-6xl px-6 py-20 md:py-24">
        <div className="text-center mb-16">
          <h2 className="text-xl font-bold tracking-tight text-fd-foreground sm:text-3xl">
            Why Choose DOTLYTE?
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-fd-muted-foreground sm:text-base">
            Stop writing config boilerplate. Get a universal, type-safe configuration API that feels native in every language.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:gap-8">
          {features.map((f) => (
            <div
              key={f.title}
              className={`relative overflow-hidden rounded-3xl border border-fd-border bg-fd-card p-7 ${f.border}`}
            >
              <div className={`absolute top-0 right-0 -m-8 h-32 w-32 rounded-full blur-3xl opacity-40 ${f.bg}`} />
              <div className="relative z-10">
                <div className={`mb-6 inline-flex rounded-2xl p-4 ${f.bg} ${f.color} ring-1 ring-inset ${f.border}`}>
                  {f.icon}
                </div>
                <h3 className="text-lg font-bold text-fd-foreground">{f.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-fd-muted-foreground">
                  {f.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section className="w-full px-6 pb-20 md:pb-24">
        <div className="relative mx-auto max-w-5xl overflow-hidden rounded-[2.5rem] border border-fd-border bg-fd-card px-6 py-16 text-center sm:px-16">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-fd-primary/20 via-fd-card to-fd-card opacity-50" />
          <h2 className="text-2xl font-bold tracking-tight text-fd-foreground md:text-3xl">
            Ready to standardize your config?
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-sm text-fd-muted-foreground sm:text-base">
            Drop in DOTLYTE and never worry about parsing environment variables, type casting strings, or bridging .env with YAML ever again.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <Link
              href="/docs/getting-started"
              className="inline-flex items-center gap-2 rounded-full bg-fd-primary px-8 py-3.5 text-sm font-bold text-fd-primary-foreground"
            >
              Get Started Now
              <Zap className="h-4 w-4" />
            </Link>
            <a
              href="https://github.com/dotlyte/dotlyte"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-fd-border bg-fd-background px-8 py-3.5 text-sm font-bold text-fd-foreground"
            >
              View on GitHub
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="w-full border-t border-fd-border bg-fd-background px-6 py-12">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 sm:flex-row">
          <p className="text-sm text-fd-muted-foreground">
            MIT Licensed · Built with <Heart className="mx-1 inline h-4 w-4 text-red-500 fill-red-500" /> by the DOTLYTE Contributors
          </p>
          <div className="flex gap-4">
             <Link href="/docs" className="text-sm font-medium text-fd-muted-foreground">Documentation</Link>
             <Link href="/docs/api/load" className="text-sm font-medium text-fd-muted-foreground">API Reference</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
