export async function copyDoctorOutput(
  output: string,
  clipboard: Pick<Clipboard, 'writeText'>
): Promise<boolean> {
  if (!output) return false;
  await clipboard.writeText(output);
  return true;
}

/** Run one Doctor action at a time, including before React applies state updates. */
export async function runDoctorExclusively(
  lock: { current: boolean },
  operation: () => Promise<void>
): Promise<boolean> {
  if (lock.current) return false;
  lock.current = true;
  try {
    await operation();
    return true;
  } finally {
    lock.current = false;
  }
}
