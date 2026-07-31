export type NamingPreset = 'preset1' | 'preset2' | 'preset3' | 'custom' | string;

export const generateImageFileName = (preset: NamingPreset, prefix: string | undefined, model: string, resolution: string) => {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const prefixStr = prefix ? `${prefix}_` : '';
  return `${prefixStr}${model}_${resolution}_${dateStr}.png`;
};

export const downloadImage = async (url: string, filename: string) => {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objectUrl);
  } catch (error) {
    console.error("Failed to download image:", error);
  }
};

export const copyImageToClipboard = async (url: string) => {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const item = new ClipboardItem({ [blob.type]: blob });
    await navigator.clipboard.write([item]);
    return true;
  } catch (error) {
    console.error("Failed to copy image to clipboard:", error);
    return false;
  }
};
