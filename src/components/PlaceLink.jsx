import { mapUrl, useMetadata } from "../media";

/** A property's location as a link that opens Google Maps (the landlord's link, or a search for the address). */
export default function PlaceLink({ location, uri, className = "" }) {
  const { lat, lng, mapLink } = useMetadata(uri);
  return (
    <a
      className={`place-link ${className}`}
      href={mapUrl({ mapLink, lat, lng, location })}
      target="_blank"
      rel="noreferrer"
      title="Open in Google Maps"
    >
      <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
        <path
          fill="currentColor"
          d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"
        />
      </svg>
      {location}
    </a>
  );
}
