export function StoryProgress({ total, active }: { total: number; active: number }) {
  return <div className="flex gap-1" aria-label={`Story ${active + 1} dari ${total}`}>{Array.from({ length: total }, (_, index) => <span key={index} className={`h-1 flex-1 rounded-full ${index <= active ? "bg-white" : "bg-white/35"}`} />)}</div>;
}
