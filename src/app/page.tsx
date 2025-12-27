import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-8 text-center text-foreground bg-background relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary opacity-20 blur-[120px] rounded-full pointer-events-none" />

      <h1 className="text-5xl font-bold tracking-tighter mb-4 z-10 glow-text">
        SEO Report Hub
      </h1>
      <p className="text-xl text-foreground-muted max-w-lg mb-8 z-10">
        Advanced analytics and reporting for your web presence.
        Connect Search Console and Bing Webmaster Tools in one place.
      </p>

      <div className="flex gap-4 z-10">
        <Link href="/dashboard">
          <button className="px-6 py-3 bg-primary hover:bg-opacity-90 text-white rounded-lg font-medium transition-all shadow-[0_0_20px_rgba(99,102,241,0.5)]">
            Get Started
          </button>
        </Link>
        <Link href="https://github.com/Honeycrypto25/seo-reports" target="_blank">
          <button className="px-6 py-3 border border-border-light hover:border-primary text-foreground rounded-lg font-medium transition-colors glass">
            Documentation
          </button>
        </Link>
      </div>
    </div>
  );
}
