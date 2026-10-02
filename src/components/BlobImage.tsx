import { useEffect, useState } from 'preact/hooks';

export function useObjectUrl(blob: Blob | undefined | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

export function BlobImage({ blob, alt, class: cls, style }: { blob?: Blob | null; alt: string; class?: string; style?: Record<string, string | number> }) {
  const url = useObjectUrl(blob);
  return url ? <img src={url} alt={alt} class={cls} style={style} draggable={false} /> : <div class={cls} style={style} aria-label={alt} />;
}
