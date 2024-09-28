import { Component } from '@angular/core';
import { fromWorkerPool } from 'observable-webworker';
import {
  NgbAccordionBody,
  NgbAccordionButton,
  NgbAccordionCollapse,
  NgbAccordionDirective,
  NgbAccordionHeader,
  NgbAccordionItem,
  NgbProgressbar,
  NgbTooltip,
} from '@ng-bootstrap/ng-bootstrap';
import { Observable, concatAll, from, map, reduce, tap } from 'rxjs';

import { FlateError, unzip, zip } from 'fflate';

import { DownloadData } from '../models/download-data';
import { NamedFile } from '../models/named-file';


@Component({
  selector: 'app-compressor',
  standalone: true,
  imports: [
    NgbAccordionDirective,
    NgbAccordionItem,
    NgbAccordionHeader,
    NgbAccordionButton,
    NgbAccordionCollapse,
    NgbAccordionBody,
    NgbTooltip,
    NgbProgressbar,
  ],
  templateUrl: './compressor.component.html',
  styleUrl: './compressor.component.scss',
})
export class CompressorComponent {
  // quality setting
  // passed as cq setting to libavif
  quality: number = 33;
  // progressbar current
  progress: number = 0;
  // progressbar max
  progressMax: number = 100;
  // show progressbar
  inProgress: boolean = false;
  // display elapsed time
  elapsedTime: string = '';

  clearPicker: boolean = true;

  // formatter for file sizes
  formatSize(n: string): string {
    const bytes: number = parseInt(n);
    //if over a MegaByte (binary)
    if (bytes >= 1048576) {
      const mBytes: number = bytes / 1048576;
      return `${(Math.round(mBytes * 100) / 100).toLocaleString()} MiB`
      // else if over a KiloByte (binary)
    } else if (bytes > 1024) {
      const kBytes: number = bytes / 1024;
      return `${Math.round(kBytes).toLocaleString()} KiB`
    } else {
      return `${bytes.toLocaleString()} Bytes`
    }
  };

  // dispatcher for web workers using observable-webworker
  // https://github.com/cloudnc/observable-webworker
  convertImages(i: NamedFile[]): Observable<NamedFile[]> {
    return fromWorkerPool<NamedFile, NamedFile[]>(
      () =>
        new Worker(new URL('./compressor.worker', import.meta.url), {
          type: 'module',
        }),
      i
    );
  }

  isfileWebP(fileName: string) {
    return fileName.endsWith('.webp');
  }

  stripLeadingZeros(s: string): string {
    return parseInt(s).toString()
  }

  setQuality(s: string): void {
    const n = Number(s);
    this.quality = n;
  }

  // remove and re-add the file picker to the DOM
  // to allow selecting the same file again
  // if someone has a better idea, hit me up on github
  toggleClearPicker() {
    this.clearPicker = !this.clearPicker;
  }
  
  // main function to setup conversion
  // takes an array of File objects and paths as input
  convert(files: NamedFile[]): Observable<NamedFile> {
        return from(files).pipe(
          // show progressbar
          // todo: figure out why this cares if x is typed any
          tap((x: any) => (this.inProgress = true)),
          // store length of array for progressbar
          tap((x: NamedFile) => this.progressMax = files.length),
          // send the files off to the dispatch function
          map(
            (x: NamedFile) => {
              // console.log([x])
              return this.convertImages([x])
            }
          ),
          concatAll()
        ) as any;
  }

  result: DownloadData | null = null;

  async process(e: Event | null): Promise<void> {
    if(!e) return 
    const target = e.target as HTMLInputElement;
    let infiles = target.files;
    // incase you canceled the file select, you won't lose your
    // previous result
    if (!infiles) return;

    const startTime: number = performance.now();

    // revoke any references to previously compressed
    // CYOAs to free memory
    if(this.result?.href) {
      URL.revokeObjectURL(this.result.href)
    }
    
    this.result = null;

    const infile: File = infiles[0];
    this.progress = 0;


    const fileBuffer = await infile.arrayBuffer()

    const fileArray = new Uint8Array(fileBuffer);

    // const archive = await Archive.open(infile)
    // await archive.extractFiles();
    // let files: NamedFile[] = await archive.getFilesArray();

    unzip(fileArray, (err, unzipped) => {

      const files: NamedFile[] = Object.entries(unzipped).map((x: [string, Uint8Array]) => {
        return { pathname: x[0], file: x[1] }
      })

    
      this.convert(files)
        .pipe(
          // update progressbar
          // also update progress for WebPs that were already in the CYOA
          tap((x: NamedFile) => this.isfileWebP(x.pathname) ? this.progress++ : null),
          // collect all the results together into one array
          reduce(
            (acc: NamedFile[], value: NamedFile): NamedFile[] => [
              ...acc,
              value,
            ],
            [] as NamedFile[]
          )
        )
        .subscribe((convertedFiles: NamedFile[]) => {
          // hide progressbar
          this.inProgress = false;

          const endTime: number = performance.now();

          // runtime in milliseconds with decimal
          const elapsedMS: number = endTime - startTime;

          this.elapsedTime = new Date(elapsedMS).toISOString().slice(11, -3);

          let zippable: any = {}
          
          convertedFiles.forEach((nf: NamedFile) => {
            zippable[nf.pathname] = nf.file
          })

          zip(zippable, (err: FlateError | null, data: Uint8Array) => {
            const blob = new Blob([data])
            const outfile = new File([blob], infile.name, { type: infile.type });
            this.result = {
              href: URL.createObjectURL(outfile),
              download: outfile.name,
              innerText: outfile.name,
              inFileSize: this.formatSize(infile.size.toString()),
              outFileSize: this.formatSize(outfile.size.toString()),
            }
          })
        });
    })
  }
}
