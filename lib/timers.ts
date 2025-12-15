export type StepTimers = {
  timings: Record<string, number>;
  start: (label: string) => () => void;
};

export function createStepTimers(): StepTimers {
  const timings: Record<string, number> = {};
  const start = (label: string) => {
    const startedAt = Date.now();
    return () => {
      timings[label] = Date.now() - startedAt;
    };
  };
  return { timings, start };
}
