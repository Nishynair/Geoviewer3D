export interface ViewerDataSourceActions<T> {
  add(source: T): Promise<unknown>;
  remove(source: T): void;
  flyTo(source: T): Promise<unknown>;
}

export async function addAndFlyToIfCurrent<T>(
  source: T,
  actions: ViewerDataSourceActions<T>,
  isCurrent: () => boolean,
  onAdded?: () => void,
): Promise<boolean> {
  await actions.add(source);
  if (!isCurrent()) {
    actions.remove(source);
    return false;
  }

  onAdded?.();

  try {
    await actions.flyTo(source);
  } catch (error: unknown) {
    if (isCurrent()) throw error;
    actions.remove(source);
    return false;
  }

  if (!isCurrent()) {
    actions.remove(source);
    return false;
  }

  return true;
}
