import { MODULES } from '@/constants/modules';

/** Quiet footer line: how much of the roadmap is built. */
export function RoadmapStatus() {
  const delivered = MODULES.filter((module) => module.status === 'done').length;

  return (
    <p className="text-xs text-muted-foreground">
      Modules delivered: {delivered} of {MODULES.length}
    </p>
  );
}
