/// <reference lib="webworker" />
import webpencode, { init as initWebPEncode } from '@jsquash/webp/encode';
import avifencode, { init as initAVIFEncode } from '@jsquash/avif/encode';

import { DoWorkUnit, runWorker } from 'observable-webworker';
import { Observable, from } from 'rxjs';

import { NamedFile } from '../models/named-file';

initWebPEncode(undefined, {
  // Customise the path to load the wasm file
  locateFile: (path: string, prefix: string) => './assets/wasm/webp_enc_simd.wasm'
});

initAVIFEncode(undefined, {
  // Customise the path to load the wasm file
  locateFile: (path: string, prefix: string) => './assets/wasm/avif_enc.wasm'
});

export class CompressorWorker implements DoWorkUnit<NamedFile, NamedFile> {
  public workUnit(input: NamedFile): Observable<NamedFile> {
    return from(this.convert(input));
  }
  async convert(nf: NamedFile): Promise<NamedFile> {
    const blob = new Blob([nf.file])
    // const outfile = new File([blob], infile.name, { type: infile.type });
    // convert to imageData for avif encoder
    let image;
    // if it isn't an image return the file unchanged
    try {
      image = await createImageBitmap(blob);
    } catch (e) {
      return nf;
    }
    const canvas = new OffscreenCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d');
    ctx!.drawImage(image, 0 ,0, image.width, image.height);
    const imageData = ctx!.getImageData(0, 0, image.width, image.height);
    
    let b: Blob;
    // compress pngs to lossless webp, other (presumably lossy)
    // formats to high quality avif
    // we are relying on extension here
    if (nf.pathname.endsWith('.png')){

      const webPBuffer = await webpencode(imageData!, {quality: 80, lossless: 1});;

      b = new Blob([webPBuffer]);

      if (blob.size < b.size) {
        b = blob;
      } else {
        let splitPath = nf.pathname.split('.');
        splitPath[splitPath.length - 1] = 'webp';
        nf.pathname = splitPath.join('.');
      }
    } else {

      const avifBuffer = await avifencode(imageData!, {cqLevel: 20})

      b = new Blob([avifBuffer]);

      if (blob.size < b.size) {
        b = blob;
      } else {
        let splitPath = nf.pathname.split('.');
        splitPath[splitPath.length - 1] = 'avif';
        nf.pathname = splitPath.join('.');
      }
    }

    const buffer = await b.arrayBuffer()

    const f = new Uint8Array(buffer);

    return { pathname: nf.pathname, file: f}
  }


  // somebody posted this in a github issue

  copyUint8Array(sourceArray: Uint8Array) {
    // Create a new Uint8Array with the same length as the source array
    const copiedArray = new Uint8Array(sourceArray.length);
    
        // Iterate through the source array and copy its elements to the new array
        for (let i = 0; i < sourceArray.length; i++) {
            copiedArray[i] = sourceArray[i];
        }
        // Return the new Uint8Array
        return copiedArray;
    }
}

runWorker(CompressorWorker);
