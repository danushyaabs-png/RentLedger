import { useRef, useState } from "react";
import { compressImage } from "../media";
import IpfsImage from "./IpfsImage";

export const MAX_PHOTOS = 6;

/**
 * photos: [{ key, uri?, data? }]  uri = already uploaded (ipfs://…), data = new photo as a data URL.
 * The first photo is the cover.
 */
export default function PhotoPicker({ photos, onChange }) {
  const input = useRef(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function add(files) {
    setError("");
    const room = MAX_PHOTOS - photos.length;
    const chosen = [...files].filter((f) => f.type.startsWith("image/")).slice(0, room);
    if (files.length > room) setError(`You can add up to ${MAX_PHOTOS} photos.`);
    if (!chosen.length) return;
    setLoading(true);
    try {
      const added = [];
      for (const f of chosen) added.push({ key: `${Date.now()}-${Math.random()}`, data: await compressImage(f) });
      onChange([...photos, ...added]);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      if (input.current) input.current.value = "";
    }
  }

  const remove = (key) => onChange(photos.filter((p) => p.key !== key));
  const makeCover = (key) => onChange([photos.find((p) => p.key === key), ...photos.filter((p) => p.key !== key)]);

  return (
    <div className="photos">
      <div
        className="photo-grid"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          add(e.dataTransfer.files);
        }}
      >
        {photos.map((p, i) => (
          <figure key={p.key} className="photo">
            {p.data ? <img src={p.data} alt={`Photo ${i + 1}`} /> : <IpfsImage uri={p.uri} alt={`Photo ${i + 1}`} />}
            {i === 0 ? (
              <span className="photo-cover">Cover</span>
            ) : (
              <button type="button" className="photo-make-cover" onClick={() => makeCover(p.key)}>
                Make cover
              </button>
            )}
            <button type="button" className="photo-remove" onClick={() => remove(p.key)} aria-label={`Remove photo ${i + 1}`}>
              ×
            </button>
          </figure>
        ))}
        {photos.length < MAX_PHOTOS && (
          <button type="button" className="photo-add" onClick={() => input.current?.click()} disabled={loading}>
            <span aria-hidden="true">+</span>
            {loading ? "Preparing…" : photos.length ? "Add more" : "Add photos"}
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        hidden
        onChange={(e) => add(e.target.files)}
      />
      <p className="muted small">Up to {MAX_PHOTOS} photos. Drag them here or click Add. The first one is the cover.</p>
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
