/** One cloud component must map to exactly one safe Windows component. */
export function isSafeCloudName(name: string): boolean {
  return name.length > 0 && name.length <= 255 && name === name.trim() &&
    !/[<>:"/\\|?*\x00-\x1f]/.test(name) && !/[. ]$/.test(name) &&
    !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name) &&
    name !== '.' && name !== '..' && name.toLowerCase() !== '.gescon-recovery';
}
export function assertSafeCloudName(name: string): void {
  if (!isSafeCloudName(name)) throw new Error('Nome incompatível com pastas e arquivos do Windows.');
}
