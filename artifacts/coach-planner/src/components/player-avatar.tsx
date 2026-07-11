// Round player avatar: shows the photo when one is set, otherwise falls
// back to the jersey number circle used across the app.
interface PlayerAvatarProps {
  photo?: string | null;
  jerseyNumber: number;
  /** Tailwind size classes, e.g. "w-10 h-10 text-sm" */
  className?: string;
}

export function PlayerAvatar({ photo, jerseyNumber, className = 'w-10 h-10 text-sm' }: PlayerAvatarProps) {
  if (photo) {
    return (
      <img
        src={photo}
        alt=""
        className={`${className} rounded-full object-cover shrink-0 border border-white/10`}
      />
    );
  }
  return (
    <div
      className={`${className} rounded-full bg-muted flex items-center justify-center font-mono font-bold text-muted-foreground shrink-0`}
    >
      {jerseyNumber}
    </div>
  );
}
