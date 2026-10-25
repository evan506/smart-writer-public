export type ActionSuccess<T extends object = Record<never, never>> = T & {
  error: null;
};

export type ActionFailure = { error: string };

export type ActionResult<T extends object = Record<never, never>> =
  | ActionSuccess<T>
  | ActionFailure;
