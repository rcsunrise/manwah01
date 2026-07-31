import fetch from 'node-fetch';
import sharp from 'sharp';

async function test() {
  const buffer = await sharp({
    create: {
      width: 1000,
      height: 500,
      channels: 4,
      background: { r: 255, g: 0, b: 0, alpha: 1 }
    }
  }).png().toBuffer();
  
  const base64 = buffer.toString('base64');
  
  const payload = {
    prompt: "A beautiful red sunset landscape",
    model: "google/gemini-3-pro-image-preview",
    resolution: "1K",
    aspectRatio: "Auto", 
    images: [{
      mimeType: "image/png",
      data: base64
    }]
  };
  
  const res = await fetch('http://localhost:3000/api/gateway/generate-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-user-id': 'system' },
    body: JSON.stringify(payload)
  });
  
  const text = await res.text();
  const cleanText = text.trim();
  const data = JSON.parse(cleanText);
  if (data.candidates && data.candidates[0].content.parts) {
      const parts = data.candidates[0].content.parts;
      const imgPart = parts.find(p => p.inlineData);
      if (imgPart) {
          const imgBase64 = imgPart.inlineData.data;
          const imgBuffer = Buffer.from(imgBase64, 'base64');
          const meta = await sharp(imgBuffer).metadata();
          console.log(`Output dimension: ${meta.width} x ${meta.height}`);
      } else {
          console.log("No image returned");
      }
  }
}
test().catch(console.error);
