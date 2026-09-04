import { Camera, RefreshCw, Video, UploadCloud } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";
import { storiesClient, StoriesClientError } from "./stories-client";
import { validateStoryFile } from "./story-validation";
import { compressStoryImage } from "./media-compression";
import type { StoryMediaType } from "./story-types";

type Props = { open: boolean; onOpenChange: (open: boolean) => void; onSuccess: () => void };

export function StoryUploadSheet({ open, onOpenChange, onSuccess }: Props) {
  const photoRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const submitLock = useRef(false);
  const [mediaType, setMediaType] = useState<StoryMediaType | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [duration, setDuration] = useState<number>();
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [saving, setSaving] = useState(false);

  const choosePhoto = () => { setMediaType("image"); setFile(null); setPreview(""); setDuration(undefined); setError(null); photoRef.current?.click(); };
  const chooseVideo = () => { setMediaType("video"); setFile(null); setPreview(""); setDuration(undefined); setError(null); videoRef.current?.click(); };

  const onFile = (type: StoryMediaType, candidate?: File) => {
    if (!candidate) return;
    const validation = validateStoryFile(candidate, type, duration);
    if (validation) { setError(validation); return; }
    setFile(candidate);
    setPreview(URL.createObjectURL(candidate));
    setError(null);
  };

  const publish = async () => {
    if (!file || !mediaType || submitLock.current) return;
    submitLock.current = true;
    setSaving(true);
    setProgress(20);
    setError(null);
    try {
      const uploadFile = mediaType === "image" ? await compressStoryImage(file) : file;
      const grant = await storiesClient.createUploadGrant({ file: uploadFile, mediaType, durationSeconds: duration });
      setProgress(55);
      await storiesClient.upload(grant, uploadFile);
      setProgress(100);
      toast.success("Story berhasil dibagikan.");
      onOpenChange(false);
      onSuccess();
    } catch (cause) {
      setError(cause instanceof StoriesClientError ? cause.message : "Story belum berhasil dibagikan. Coba lagi.");
    } finally {
      submitLock.current = false;
      setSaving(false);
    }
  };

  const reset = () => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview("");
    setMediaType(null);
    setError(null);
    setProgress(0);
  };

  const retake = () => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview("");
    setDuration(undefined);
    setError(null);
    if (mediaType === "video") videoRef.current?.click();
    else photoRef.current?.click();
  };

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) reset(); onOpenChange(next); }}>
      <SheetContent
        side="bottom"
        className="z-[2000] mx-auto w-full max-w-md rounded-t-[24px] p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
      >
        <SheetHeader>
          <SheetTitle>Tambah Story</SheetTitle>
          <SheetDescription>Buka kamera lalu bagikan foto atau video singkat yang aktif selama 24 jam.</SheetDescription>
        </SheetHeader>

        {/* Hidden camera inputs — `capture` forces the device camera on mobile, skips the gallery */}
        <input ref={photoRef} type="file" className="sr-only" accept="image/*" capture="environment" onChange={(event) => onFile("image", event.target.files?.[0])} />
        <input ref={videoRef} type="file" className="sr-only" accept="video/*" capture="environment" onChange={(event) => onFile("video", event.target.files?.[0])} />

        {!file ? (
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={choosePhoto} className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-muted/30 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Camera className="h-5 w-5 text-primary" aria-hidden="true" />
              Foto
            </button>
            <button type="button" onClick={chooseVideo} className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-muted/30 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Video className="h-5 w-5 text-primary" aria-hidden="true" />
              Video
            </button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-muted/20">
            {mediaType === "video" ? (
              <video src={preview} controls className="max-h-64 w-full object-contain" onLoadedMetadata={(event) => { const value = event.currentTarget.duration; setDuration(value); if (mediaType) setError(validateStoryFile(file, mediaType, value)); }} />
            ) : (
              <img src={preview} alt="Preview Story" className="max-h-64 w-full object-contain" />
            )}
            <p className="flex items-center justify-between gap-2 p-3 text-xs font-semibold text-muted-foreground">
              <span className="min-w-0 truncate">{file.name}</span>
              <button type="button" onClick={retake} disabled={saving} className="shrink-0 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-bold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <RefreshCw className="mr-1 inline-block h-3 w-3" aria-hidden="true" />
                {mediaType === "video" ? "Video Ulang" : "Foto Ulang"}
              </button>
            </p>
          </div>
        )}

        {error ? <p role="alert" className="mt-3 text-xs font-semibold text-destructive">{error}</p> : null}
        {saving ? (
          <div className="mt-3" role="status" aria-live="polite">
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">Mengunggah Story…</p>
          </div>
        ) : null}

        <SheetFooter>
          <Button variant="outline" size="lg" onClick={() => onOpenChange(false)} disabled={saving}>Batal</Button>
          <Button size="lg" onClick={() => void publish()} disabled={!file || Boolean(error) || saving} loading={saving} loadingText="Mengunggah…">
            <UploadCloud aria-hidden="true" /> Bagikan Story
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
