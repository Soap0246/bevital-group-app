import { branding, type LogoVariant } from "@/config/branding";

/** Renders an official logo from the central branding config. Never redraws or re-types a logo. */
export function Logo({ variant, height = 40, className }: { variant: LogoVariant; height?: number; className?: string }) {
  const logo = branding.logos[variant];
  const width = Math.round(height * logo.aspectRatio);
  if (logo.isPlaceholder) {
    return (
      <div
        role="img"
        aria-label={logo.alt}
        style={{ width, height, fontSize: Math.max(9, height * 0.2) }}
        className={`flex items-center justify-center rounded-lg border-2 border-dashed border-line-strong text-subtle ${className ?? ""}`}
      >
        {variant === "main" ? "LOGO A (placeholder)" : "LOGO B (placeholder)"}
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={logo.src} alt={logo.alt} width={width} height={height} className={className} style={{ height, width: "auto" }} />;
}
