import { useEffect, useState } from "react";
import { candidateUrls } from "../media";

/** An <img> for an ipfs:// (or normal) link that falls back to the next gateway if one fails. */
export default function IpfsImage({ uri, alt = "", onAllFailed, ...rest }) {
  const urls = candidateUrls(uri);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => setAttempt(0), [uri]);
  if (!urls.length) return null;
  return (
    <img
      {...rest}
      src={urls[Math.min(attempt, urls.length - 1)]}
      alt={alt}
      onError={() => (attempt + 1 < urls.length ? setAttempt(attempt + 1) : onAllFailed?.())}
    />
  );
}
