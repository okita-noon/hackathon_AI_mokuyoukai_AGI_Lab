/** Reject before FileReader allocates a large base64 copy on a mobile device. */
export function uploadError(file: { type: string; size: number }): string | null {
  if (!/^(image\/(jpeg|png|webp|gif)|video\/(mp4|webm|quicktime))$/.test(file.type)) {
    return "JPEG・PNG・WebP・GIFの写真、またはMP4・WebM・MOVの動画を選んでください。";
  }
  if (!Number.isFinite(file.size) || file.size <= 0) return "空のファイルは提出できません。";
  const max = file.type.startsWith("video/") ? 32 : 8;
  return file.size > max * 1024 * 1024 ? `${max}MB以下のファイルを選んでください。` : null;
}
