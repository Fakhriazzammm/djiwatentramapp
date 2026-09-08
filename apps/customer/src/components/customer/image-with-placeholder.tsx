import { useEffect, useState, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type ImageWithPlaceholderProps = Omit<ComponentPropsWithoutRef<"img">, "onLoad" | "onError"> & {
  containerClassName?: string;
  fallback?: ReactNode;
};

export function ImageWithPlaceholder({
  alt,
  className,
  containerClassName,
  fallback,
  ...props
}: ImageWithPlaceholderProps) {
  const [state, setState] = useState<"loading" | "loaded" | "error">(props.src ? "loading" : "error");

  useEffect(() => {
    setState(props.src ? "loading" : "error");
  }, [props.src]);

  return (
    <span
      className={cn("relative block overflow-hidden bg-muted", containerClassName)}
      aria-busy={state === "loading"}
    >
      {state !== "loaded" ? (
        <span
          className="absolute inset-0 animate-pulse bg-gradient-to-r from-muted via-muted/60 to-muted"
          aria-hidden="true"
        />
      ) : null}
      {state === "error" ? (
        <span
          className="absolute inset-0 flex items-center justify-center bg-muted text-[10px] font-semibold text-muted-foreground"
          aria-hidden="true"
        >
          {fallback ?? "Gambar tidak tersedia"}
        </span>
      ) : null}
      <img
        {...props}
        alt={alt}
        onLoad={() => setState("loaded")}
        onError={() => setState("error")}
        className={cn(
          "relative block h-full w-full object-cover transition-opacity duration-300",
          state === "loaded" ? "opacity-100" : "opacity-0",
          className,
        )}
      />
    </span>
  );
}
