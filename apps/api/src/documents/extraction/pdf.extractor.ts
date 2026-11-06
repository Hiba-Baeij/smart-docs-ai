import { Injectable } from '@nestjs/common';
import type { FileType } from '@smartdocs/contracts';
import type {
  DocumentExtractor,
  ExtractedDocument,
} from './document-extractor';

@Injectable()
export class PdfExtractor implements DocumentExtractor {
  supports(fileType: FileType): boolean {
    return fileType === 'pdf';
  }

  async extract(
    file: Parameters<DocumentExtractor['extract']>[0],
  ): Promise<ExtractedDocument> {
    // unpdf is ESM-only and this project compiles to CommonJS, so it is loaded here, in the one
    // place that uses it, instead of changing the module system for a single import.
    const { getDocumentProxy, extractText } = await import('unpdf');

    // A copy: PDF.js takes ownership of the bytes it is given.
    const pdf = await getDocumentProxy(new Uint8Array(file.buffer));
    try {
      const { text } = await extractText(pdf, { mergePages: false });
      const pages = text.map((pageText, index) => ({
        pageNumber: index + 1,
        text: pageText.trim(),
      }));
      return {
        text: pages
          .map((page) => page.text)
          .filter((pageText) => pageText !== '')
          .join('\n\n'),
        pages,
      };
    } finally {
      await pdf.loadingTask.destroy();
    }
  }
}
