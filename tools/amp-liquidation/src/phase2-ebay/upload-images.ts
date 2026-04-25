import axios from 'axios';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import FormData from 'form-data';
import xml2js from 'xml2js';
import { PhotoAnalysis } from '../phase1-copy/analyze-photos';

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 85;
const MAX_IMAGES = 24;

const EBAY_EPS_URL = 'https://api.ebay.com/ws/api.dll';

async function resizeImage(inputPath: string): Promise<Buffer> {
  return sharp(inputPath)
    .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();
}

export async function uploadFourfrontImages(userToken: string): Promise<string[]> {
  const photoDir = path.resolve(process.cwd(), 'photos', 'fourfront');
  if (!fs.existsSync(photoDir)) {
    throw new Error(`Photo directory not found: ${photoDir}`);
  }

  let files = fs
    .readdirSync(photoDir)
    .filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f))
    .sort();

  // Reorder: hero first if we have analysis
  const analysisPath = path.resolve(process.cwd(), 'output', 'fourfront-photo-analysis.json');
  if (fs.existsSync(analysisPath)) {
    const analysis: PhotoAnalysis = JSON.parse(fs.readFileSync(analysisPath, 'utf8'));
    const heroFile = files[analysis.best_hero_index];
    if (heroFile) {
      files = [heroFile, ...files.filter((f) => f !== heroFile)];
    }
  }

  files = files.slice(0, MAX_IMAGES);
  console.log(`📷 Uploading ${files.length} images to eBay EPS...`);

  const urls: string[] = [];

  for (const file of files) {
    const filePath = path.join(photoDir, file);
    const imageBuffer = await resizeImage(filePath);

    const form = new FormData();
    form.append('image', imageBuffer, { filename: file, contentType: 'image/jpeg' });

    const xmlRequest = `<?xml version="1.0" encoding="utf-8"?>
<UploadSiteHostedPicturesRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <ebl:eBayAuthToken xmlns:ebl="urn:ebay:apis:eBLBaseComponents">${userToken}</ebl:eBayAuthToken>
  </RequesterCredentials>
  <PictureSet>Standard</PictureSet>
</UploadSiteHostedPicturesRequest>`;

    form.append('XML Payload', xmlRequest, { contentType: 'text/xml' });

    const response = await axios.post(EBAY_EPS_URL, form, {
      headers: {
        ...form.getHeaders(),
        'X-EBAY-API-CALL-NAME': 'UploadSiteHostedPictures',
        'X-EBAY-API-SITEID': '0',
        'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
      },
    });

    const parsed = await xml2js.parseStringPromise(response.data as string);
    const pictureUrl =
      parsed?.UploadSiteHostedPicturesResponse?.SiteHostedPictureDetails?.[0]
        ?.FullURL?.[0];

    if (!pictureUrl) {
      throw new Error(`Failed to get picture URL for ${file}`);
    }

    urls.push(pictureUrl as string);
    console.log(`  ✅ ${file} → ${pictureUrl}`);
  }

  // Save URLs
  const urlsPath = path.resolve(process.cwd(), 'output', 'fourfront-image-urls.json');
  fs.writeFileSync(urlsPath, JSON.stringify(urls, null, 2));
  console.log(`\n✅ Uploaded ${urls.length} images. Saved to ${urlsPath}`);

  return urls;
}
