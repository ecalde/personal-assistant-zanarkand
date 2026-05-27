import { MapperError } from "./dbMappers";
import { RemoteStorageError } from "./remoteStorage";

export function cloudSafeMessage(err: unknown): string {
  if (err instanceof RemoteStorageError) return err.message;
  if (err instanceof MapperError) return err.message;
  return "Could not save to cloud. Your changes are saved locally.";
}

export function loadDataErrorMessage(err: unknown): string {
  if (err instanceof RemoteStorageError) return err.message;
  if (err instanceof MapperError) return err.message;
  return "Could not load your data. Please try again.";
}
