/** Original Djiwa Pay mascot; static rendering respects reduced motion. */
export function DjiwaPayLogoLoader({ size = 96, className }: { size?: number; className?: string }) {
  return <img src="/assets/djiwapay-studio/mascot.webp" alt="Djiwa Pay" width={size} height={size} className={className} style={{ width: size, height: size, objectFit: "contain" }} />;
}
