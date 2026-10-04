import { useEffect, useRef, useState, type ComponentPropsWithoutRef, type ReactNode } from "react";
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
  const startedAtRef = useRef(Date.now());
  const loadTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (loadTimerRef.current !== null) window.clearTimeout(loadTimerRef.current);
    startedAtRef.current = Date.now();
    setState(props.src ? "loading" : "error");
    return () => {
      if (loadTimerRef.current !== null) window.clearTimeout(loadTimerRef.current);
    };
  }, [props.src]);

  const handleLoad = () => {
    const remaining = Math.max(0, 220 - (Date.now() - startedAtRef.current));
    loadTimerRef.current = window.setTimeout(() => setState("loaded"), remaining);
  };

  return (
    <span
      className={cn("relative block overflow-hidden bg-muted", containerClassName)}
      aria-busy={state === "loading"}
    >
      {state === "loading" ? (
        <span
          className="absolute inset-0 z-[1] animate-pulse bg-gradient-to-r from-muted/65 via-muted/20 to-muted/65 transition-opacity duration-500"
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
        onLoad={handleLoad}
        onError={() => {
          if (loadTimerRef.current !== null) window.clearTimeout(loadTimerRef.current);
          setState("error");
        }}
        className={cn(
          "relative block h-full w-full object-cover transition-[filter,opacity] duration-500 ease-out",
          state === "loaded" ? "opacity-100" : "opacity-80",
          className,
        )}
      />
    </span>
  );
}
