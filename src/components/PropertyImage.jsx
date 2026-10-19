import { useState } from "react";
import { useMetadata } from "../media";
import IpfsImage from "./IpfsImage";

/** Cover photo of a property. `src` is the listing's metadataURI (IPFS details or a plain image URL). */
export default function PropertyImage({ src, name, showCount = false }) {
  const { images } = useMetadata(src);
  const [broken, setBroken] = useState(false);
  const cover = images[0];
  if (!cover || broken) {
    return (
      <div className="img-fallback" aria-hidden="true">
        <span>{(name || "?").slice(0, 1).toUpperCase()}</span>
      </div>
    );
  }
  return (
    <>
      <IpfsImage uri={cover} alt={name} loading="lazy" onAllFailed={() => setBroken(true)} />
      {showCount && images.length > 1 && <span className="photo-count">{images.length} photos</span>}
    </>
  );
}
