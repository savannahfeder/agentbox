// A picture picked from disk, shrunk in the window before it is sent: a photo
// cropped to a square jpg, a logo fitted whole into a square png so a
// transparent background stays transparent.
import type { PictureIn } from '../types';

export async function shrinkPicture(file: Blob, { fit, size = 256 }: { fit: 'crop' | 'whole'; size?: number }): Promise<PictureIn> {
  const picture = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d')!;
  const scale = fit === 'crop' ? Math.max(size / picture.width, size / picture.height) : Math.min(size / picture.width, size / picture.height);
  const w = picture.width * scale;
  const h = picture.height * scale;
  g.imageSmoothingQuality = 'high';
  g.drawImage(picture, (size - w) / 2, (size - h) / 2, w, h);
  picture.close();
  const type = fit === 'crop' ? 'image/jpeg' : 'image/png';
  const url = canvas.toDataURL(type, 0.88);
  return { data: url.slice(url.indexOf(',') + 1), type };
}
