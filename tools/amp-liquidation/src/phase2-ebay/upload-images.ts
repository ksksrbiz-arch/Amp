import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import type { EbayTokens } from './auth';

const EBAY_EPS_URL = 'https://api.ebay.com/ws/api.dll';

export interface UploadedImage {
  localPath: string;
  ebayUrl: string;
}

/**
 * Uploads images to eBay's EPS (eBay Picture Services) using the Trading API.
 * Returns a list of hosted image URLs.
 */
export async function uploadImages(
  imagePaths: string[],
  tokens: EbayTokens
): Promise<UploadedImage[]> {
  const results: UploadedImage[] = [];

  for (const localPath of imagePaths) {
    const filename = path.basename(localPath);
    const imageData = fs.readFileSync(localPath);
    const base64 = imageData.toString('base64');
    const ext = path.extname(filename).toLowerCase().replace('.', '');
    const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';

    const xmlBody = `<?xml version="1.0" encoding="utf-8"?>
<UploadSiteHostedPicturesRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken>${tokens.accessToken}</eBayAuthToken>
  </RequesterCredentials>
  <PictureName>${filename}</PictureName>
  <PictureData contentType="${mimeType}">${base64}</PictureData>
</UploadSiteHostedPicturesRequest>`;

    const response = await axios.post<string>(EBAY_EPS_URL, xmlBody, {
      headers: {
        'X-EBAY-API-CALL-NAME': 'UploadSiteHostedPictures',
        'X-EBAY-API-SITEID': '0',
        'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
        'X-EBAY-API-APP-NAME': process.env.EBAY_APP_ID ?? '',
        'X-EBAY-API-DEV-NAME': process.env.EBAY_DEV_ID ?? '',
        'X-EBAY-API-CERT-NAME': process.env.EBAY_CERT_ID ?? '',
        'Content-Type': 'text/xml',
      },
    });

    // Parse the FullURL from the XML response
    const match = /<FullURL>(.*?)<\/FullURL>/.exec(response.data);
    if (!match) {
      throw new Error(`Failed to parse eBay EPS URL for ${filename}. Response: ${response.data}`);
    }

    results.push({ localPath, ebayUrl: match[1] });
    console.log(`[upload-images] Uploaded ${filename} -> ${match[1]}`);
  }

  return results;
}
