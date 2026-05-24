type PlumeProps = {
  className?: string;
};

export function Plume({ className = "" }: PlumeProps) {
  return (
    <div
      className={`plume-stage ${className}`}
      aria-hidden
    >
      <div className="plume plume-drift" />
      <div className="halftone" />
    </div>
  );
}
