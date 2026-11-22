export const mascotActions = ["spin", "juggle", "save", "write", "bounce"] as const;
export type MascotAction = typeof mascotActions[number];

export function DjiwaPayLogoLoader({ action, size, className }: {
  action: MascotAction;
  size?: number;
  className?: string;
}) {
  return (
    <picture>
      <source media="(prefers-reduced-motion: no-preference)" srcSet={`/assets/djiwapay-opening/${action}.gif?v=2`} />
      <img src={action === "spin" ? "/assets/djiwapay-opening/spin-rest.webp" : "/assets/djiwapay-studio/mascot.webp"} alt="" draggable={false}
        width={size} height={size} className={className} style={{ objectFit: "contain" }} />
    </picture>
  );
}
