/// <reference lib="webworker" />
import encode, { init as initWebPEncode } from '@jsquash/webp/encode';

import { DoWorkUnit, runWorker } from 'observable-webworker';
import { Observable, from } from 'rxjs';

import { NamedFile } from '../models/named-file';

initWebPEncode(undefined, {
  // Customise the path to load the wasm file
  locateFile: (path: string, prefix: string) => './assets/wasm/webp_enc_wasm.wasm'
});

export class CompressorWorker implements DoWorkUnit<NamedFile, NamedFile> {
  public workUnit(input: NamedFile): Observable<NamedFile> {
    return from(this.convert(input));
  }
  async convert(nf: NamedFile): Promise<NamedFile> {
    const blob = new Blob([nf.file])
    // const outfile = new File([blob], infile.name, { type: infile.type });
    // convert to imageData for avif encoder
    const image = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d');
    ctx!.drawImage(image, 0 ,0, image.width, image.height);
    const imageData = ctx!.getImageData(0, 0, image.width, image.height);

    const webPBuffer = await encode(imageData!, {quality: 80, lossless: 1});

    let b = new Blob([webPBuffer])
    // let f = new File([b], nf.pathname, { type: 'image/webp' })

    if (blob.size < b.size) {
      b = blob;
    } else {
      let splitPath = nf.pathname.split('.');
      splitPath[1] = 'webp';
      nf.pathname = splitPath.join('.');
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
