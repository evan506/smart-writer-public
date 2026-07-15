export function extractProjectId(pathname: string): string | null {
  const match = pathname.match(/\/projects\/([^/]+)/);
  return match ? match[1] : null;
}
