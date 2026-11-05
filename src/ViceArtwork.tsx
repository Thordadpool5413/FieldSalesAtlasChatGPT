/**
 * Ocean Drive photo composition, matching the user-selected realistic
 * Field Sales Atlas reference. Purely decorative: no fake territory data.
 * The original Field Sales Atlas logo remains the existing separate image.
 */
export default function ViceArtwork({
  compact = false,
  className = '',
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={'vice-photo-scene ' + className + (compact ? ' vice-photo-compact' : '')}
      aria-hidden="true">
      <div className="vice-scene-skyline" />
      <div className="vice-scene-artdeco" />
      {!compact && <div className="vice-scene-sun" />}
      <div className="vice-scene-water" />
      <div className="vice-scene-color" />
    </div>
  );
}
